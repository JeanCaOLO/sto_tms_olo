"""Driver de PRUEBA del flujo OMS end-to-end en LOCAL (contra Aurora por el túnel).

Flujo real (usa el MISMO código que producción, no mocks):
  EFLOW (read-only) --ingest--> orders (bandeja)
      -> Planificación (ventana 3 días, por fecha de ENTREGA)
      -> OMS barrido: PRIORIZA (dias_hasta_salida) + LIBERA (ventana por fecha de SALIDA)

Módulos reales que invoca:
  - backend/planning/src/ingest_orders.py :: ingest_cr()        (extracción EFLOW -> orders)
  - backend/planning/src/replan.py        :: replanificar_todo() (planifica (hoy, hoy+3])
  - backend/oms/src/app.py                :: correr()            (barrido ADR-013)

Uso (desde la raíz del repo):
  python scripts/prueba_flujo_oms.py estado          # ver estado de la cola (no escribe)
  python scripts/prueba_flujo_oms.py ingest [--dry-run] [--limite 500]
  python scripts/prueba_flujo_oms.py plan            # planifica la ventana de 3 días
  python scripts/prueba_flujo_oms.py barrido [--hoy YYYY-MM-DD]
  python scripts/prueba_flujo_oms.py todo            # ingest -> plan -> barrido -> estado

Prerrequisitos (ver docs/pruebas-flujo-oms-local.md):
  - Túnel a Aurora en localhost:15432  (AWS_PROFILE=olo-tms)
  - VPN/red interna hacia EFLOW (Host_EFLOW = 10.17.224.20)
  - .env / .env.local con TMS_DB_* y las creds EFLOW (Host_EFLOW/Port_EFLOW/BD_EFLOW/User_EFLOW/Pass_EFLOW
    o las estándar EFLOW_CR_*). EFLOW se toca SOLO LECTURA.
  - Python con pytds + pg8000 instalados.
"""
import os
import subprocess
import sys
from datetime import date, datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent

# Constantes de scope CR (= ingest_orders.py / tms_olo).
ORG_CR = "11111111-1111-1111-1111-111111111111"
WAREHOUSE_CR = "56ce1ef7-cdc5-4b20-89dc-30362101ab3b"
COUNTRY_CR = "22222222-2222-2222-2222-222222222221"


def _cargar_env() -> None:
    for fn in (".env.local", ".env"):
        p = REPO / fn
        if not p.exists():
            continue
        for line in p.read_text(encoding="utf-8", errors="replace").splitlines():
            s = line.strip()
            if s and not s.startswith("#") and "=" in s:
                k, _, v = s.partition("=")
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))
    # El código real espera EFLOW_CR_*; si solo están los nombres *_EFLOW, se mapean.
    alias = {"EFLOW_CR_HOST": "Host_EFLOW", "EFLOW_CR_PORT": "Port_EFLOW",
             "EFLOW_CR_USER": "User_EFLOW", "EFLOW_CR_PASSWORD": "Pass_EFLOW",
             "EFLOW_CR_DB_SAP": "BD_EFLOW"}
    for estandar, viejo in alias.items():
        if not os.environ.get(estandar) and os.environ.get(viejo):
            os.environ[estandar] = os.environ[viejo]
    # Planificación/OMS escriben DML -> usar el app user; modo live para leer de la BD.
    os.environ.setdefault("TMS_DB_USER", "tms_app")
    os.environ["OMS_SOURCE"] = "live"


def _path(*subdirs: str) -> None:
    for d in subdirs:
        p = str(REPO / Path(d))
        if p not in sys.path:
            sys.path.insert(0, p)


TMS_COMMON = "backend/common-services/layers/tms_common"
PLANNING = "backend/planning/src"
OMS = "backend/oms/src"


def _pg():
    _path(TMS_COMMON)
    from tms_common import pg
    return pg


def cmd_estado() -> None:
    pg = _pg()
    print("== Estado de la cola (orders con llave EFLOW) ==")
    for row in pg.query(
        "select wms_situation, (oms_processed_at is not null) liberado, count(*) n "
        "from tbl_orders where eflow_id_expedicion is not null group by 1,2 order by 1,2"):
        print(f"  situacion={row['wms_situation']:5} liberado={row['liberado']!s:5} -> {row['n']}")
    print("\n== Pendientes en cola (DISP/DISP, no liberados) por compañía/fecha ==")
    rows = pg.query(
        "select cu.code compania, o.delivery_date, (o.dispatch_date is not null) con_salida, "
        "       (o.prioritization_run_id is not null) priorizado, count(*) n "
        "from tbl_orders o join tbl_customers cu on cu.id=o.customer_id "
        "where o.wms_status='DISP' and o.wms_situation='DISP' and o.oms_processed_at is null "
        "  and o.eflow_id_expedicion is not null "
        "group by 1,2,3,4 order by 1,2")
    if not rows:
        print("  (cola vacía)")
    for r in rows:
        print(f"  {r['compania']:8} entrega={r['delivery_date']} salida={r['con_salida']!s:5} "
              f"priorizado={r['priorizado']!s:5} -> {r['n']}")


def cmd_ingest(dry_run: bool, limite: int) -> None:
    _path(TMS_COMMON, PLANNING)
    import ingest_orders
    print(f"== INGEST EFLOW -> orders (dry_run={dry_run}, limite={limite}) ==")
    res = ingest_orders.ingest_cr(limite=limite, dry_run=dry_run)
    print(f"  leidos={res['leidos']} upserted={res['upserted']} saltados={res['saltados']} "
          f"espejadas={res['espejadas']}")
    if res["faltantes"]:
        print("  faltantes (FK sin resolver):")
        for f in res["faltantes"]:
            print("    -", f)


def cmd_plan() -> None:
    _path(TMS_COMMON, PLANNING)
    import replan
    from tms_common import pg
    created_by = pg.query("select id from tbl_app_users limit 1")[0]["id"]
    print("== PLANIFICAR ventana (hoy, hoy+3] por fecha de ENTREGA ==")
    res = replan.replanificar_todo(ORG_CR, COUNTRY_CR, WAREHOUSE_CR, str(created_by))
    print(f"  planificados: {res['planificados']}")
    print(f"  bloqueados (ya despachados): {res['bloqueados']}")


def cmd_barrido(hoy: str | None) -> None:
    _path(TMS_COMMON, OMS)
    import app
    h = datetime.strptime(hoy, "%Y-%m-%d").date() if hoy else datetime.now(timezone.utc).date()
    print(f"== BARRIDO OMS (priorizar + liberar), hoy={h} ==")
    res = app.correr(hoy=h, limite=1000)
    print(f"  corrida={res['corrida']} total={res['total']} priorizados={res['priorizados']} "
          f"liberados={res['liberados']} pendientes={res['pendientes']}")


def cmd_todo() -> None:
    # Cada etapa en su propio proceso: planning y oms tienen módulos homónimos (app.py).
    for etapa in ("ingest", "plan", "barrido", "estado"):
        print(f"\n########## {etapa.upper()} ##########", flush=True)
        r = subprocess.run([sys.executable, __file__, etapa])
        if r.returncode != 0:
            print(f"!! etapa {etapa} falló (rc={r.returncode}); se detiene.")
            sys.exit(r.returncode)


def main() -> None:
    _cargar_env()
    args = sys.argv[1:]
    cmd = args[0] if args else "estado"
    if cmd == "estado":
        cmd_estado()
    elif cmd == "ingest":
        cmd_ingest("--dry-run" in args, int(next((a for a in args if a.isdigit()), 500)))
    elif cmd == "plan":
        cmd_plan()
    elif cmd == "barrido":
        hoy = next((args[i + 1] for i, a in enumerate(args) if a == "--hoy" and i + 1 < len(args)), None)
        cmd_barrido(hoy)
    elif cmd == "todo":
        cmd_todo()
    else:
        print(__doc__)
        sys.exit(1)


if __name__ == "__main__":
    main()
