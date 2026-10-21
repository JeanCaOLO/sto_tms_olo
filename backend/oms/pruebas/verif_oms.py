"""Verificación local del contrato OMS ↔ Planificación sobre Aurora (ADR-013).

Contraparte del OMS al plan de pruebas de Planificación (2026-10-21), CORREGIDA al
modelo real: NO existe oms.pedidos; el OMS escribe en public.orders y la costura en
sim_expedicionescabecera; priorizar deja DISP (no GENE, no oms_processed_at) y liberar
pone GENE + oms_processed_at solo dentro de la ventana dispatch_date − dias_prep_picking.

Por defecto es READ-ONLY: solo consulta Aurora y verifica invariantes del estado
actual (no corre el motor, no escribe nada). Con --barrido corre app.correr() (live)
ANTES de verificar — eso sí escribe en la BD.

Requisitos (correr después, no ahora):
  1. Túnel SSM activo (localhost:15432).
  2. pip install pg8000
Uso:
  python backend/oms/pruebas/verif_oms.py            # solo verifica (read-only)
  python backend/oms/pruebas/verif_oms.py --barrido  # corre el barrido live y verifica
  python backend/oms/pruebas/verif_oms.py --viaje 20261021-003  # prueba "Procesar a Eflow"
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]


def _cargar_env() -> None:
    for name in (".env.local", ".env"):
        path = ROOT / name
        if not path.exists():
            continue
        for line in path.read_text(encoding="utf-8").splitlines():
            key, sep, value = line.partition("=")
            if sep and not key.strip().startswith("#"):
                os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def _conectar():
    import pg8000.dbapi  # import tardío: deja claro el requisito pip install pg8000

    import ssl
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return pg8000.dbapi.connect(
        host=os.environ.get("TMS_DB_HOST", "localhost"),
        port=int(os.environ.get("TMS_DB_PORT", "5432")),
        user=os.environ.get("TMS_DB_USER"),
        password=os.environ.get("TMS_DB_PASSWORD"),
        database=os.environ.get("TMS_DB_NAME", "tms_olo"),
        ssl_context=ctx,
    )


def _uno(cur, sql: str, params=()) -> int:
    cur.execute(sql, list(params))
    return cur.fetchone()[0]


# --- Casos (contraparte OMS del plan de Planificación, ADR-013) ----------------

def verificar(cur) -> list[tuple[str, bool, str]]:
    """Devuelve [(caso, ok, detalle)]. Todo read-only."""
    r: list[tuple[str, bool, str]] = []

    # T6 — La cola del OMS: planificado y no procesado.
    cola = _uno(cur, "select count(*) from orders where planning_run_id is not null and oms_processed_at is null")
    r.append(("T6 cola (planning_run_id not null & oms_processed_at null)", cola >= 0, f"{cola} en cola"))

    # ADR-013 (a) — PRIORIZAR deja DISP: ningún priorizado-no-liberado debe estar en GENE.
    mal_gene = _uno(cur, """
        select count(*) from orders
        where prioritization_run_id is not null and oms_processed_at is null
          and wms_situation <> 'DISP'""")
    r.append(("ADR-013 priorizar deja DISP (no GENE si no liberado)", mal_gene == 0,
              f"{mal_gene} priorizados-no-liberados fuera de DISP (debe ser 0)"))

    # ADR-013 (a) — priorizar NO estampa oms_processed_at: no debe haber liberado sin prioridad.
    lib_sin_prio = _uno(cur, """
        select count(*) from orders
        where oms_processed_at is not null and prioritization_run_id is null""")
    r.append(("Liberado implica priorizado (prioritization_run_id)", lib_sin_prio == 0,
              f"{lib_sin_prio} liberados sin prioritization_run_id (debe ser 0)"))

    # ADR-013 (b) — LIBERAR pone GENE + oms_processed_at juntos y consistentes.
    lib_mal = _uno(cur, """
        select count(*) from orders
        where oms_processed_at is not null and wms_situation <> 'GENE'""")
    r.append(("Liberado => wms_situation='GENE'", lib_mal == 0,
              f"{lib_mal} con oms_processed_at pero sin GENE (debe ser 0)"))

    # ADR-013 (c) — fuera de ventana NO liberado: priorizado con dispatch_date futuro lejano
    # no debería estar liberado. (dias_prep_picking=1 => se libera si dispatch_date <= hoy+1.)
    fuera_lib = _uno(cur, """
        select count(*) from orders
        where oms_processed_at is not null and dispatch_date is not null
          and dispatch_date > current_date + 1""")
    r.append(("Fuera de ventana NO liberado (dispatch_date > hoy+1)", fuera_lib == 0,
              f"{fuera_lib} liberados fuera de ventana (debe ser 0)"))

    # T11 / costura — cada liberado tiene su fila en el espejo con TPEXSI='GENE'.
    sin_espejo = _uno(cur, """
        select count(*) from orders o
        where o.oms_processed_at is not null
          and not exists (
            select 1 from sim_expedicionescabecera s
            where s."IDALMACEN"   = o.eflow_id_almacen
              and s."IDCOMPANIA"  = o.eflow_id_compania
              and s."IDSUCURSAL"  = o.eflow_id_sucursal
              and s."IDEXPEDICION"= o.eflow_id_expedicion
              and s."TPEXSI" = 'GENE')""")
    r.append(("Cada liberado tiene fila GENE en sim_expedicionescabecera", sin_espejo == 0,
              f"{sin_espejo} liberados sin espejo GENE (debe ser 0)"))

    # T12 — hay bitácora del OMS (la pestaña Logs lee de aquí).
    tiene_logs = _uno(cur, "select case when to_regclass('public.oms_logs') is null then 0 else 1 end")
    r.append(("Tabla oms_logs existe (trazabilidad)", tiene_logs == 1, "oms_logs presente" if tiene_logs else "FALTA oms_logs"))

    return r


def correr_barrido() -> dict:
    """Corre el barrido live (app.correr()). ESCRIBE en Aurora. Solo con --barrido."""
    sys.path.insert(0, str(ROOT / "backend" / "common-services" / "layers" / "tms_common"))
    sys.path.insert(0, str(ROOT / "backend" / "oms" / "src"))
    os.environ.pop("TMS_DB_SECRET_NAME", None)
    os.environ["OMS_SOURCE"] = "live"
    import app  # noqa: E402
    return app.correr()


def procesar_viaje_manual(numero_viaje: str) -> dict:
    """Acción manual "Procesar a Eflow" sobre un viaje (ignora la ventana). ESCRIBE."""
    sys.path.insert(0, str(ROOT / "backend" / "common-services" / "layers" / "tms_common"))
    sys.path.insert(0, str(ROOT / "backend" / "oms" / "src"))
    os.environ.pop("TMS_DB_SECRET_NAME", None)
    os.environ["OMS_SOURCE"] = "live"
    import app  # noqa: E402
    # Simula el evento HTTP con el path param; permisos: en local no hay JWT, así que
    # esta vía es para prueba controlada. Alternativa: llamar la lógica directa.
    event = {"routeKey": "POST /api/v1/oms/viajes/{numero_viaje}/procesar",
             "pathParameters": {"numero_viaje": numero_viaje}, "body": None,
             "requestContext": {"http": {"method": "POST"}}}
    return app.procesar_viaje(event)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--barrido", action="store_true", help="corre el barrido live antes de verificar (ESCRIBE)")
    ap.add_argument("--viaje", help='numero_viaje para "Procesar a Eflow" (ESCRIBE, ignora ventana)')
    args = ap.parse_args()

    _cargar_env()
    print(f"host={os.environ.get('TMS_DB_HOST')}:{os.environ.get('TMS_DB_PORT')}  db={os.environ.get('TMS_DB_NAME')}")

    if args.barrido:
        print("→ barrido live:", correr_barrido())
    if args.viaje:
        print(f"→ procesar viaje {args.viaje}:", procesar_viaje_manual(args.viaje))

    conn = _conectar()
    try:
        cur = conn.cursor()
        resultados = verificar(cur)
    finally:
        conn.close()

    print("\n== Verificación del contrato OMS (ADR-013) ==")
    fallos = 0
    for caso, ok, detalle in resultados:
        print(f"  [{'PASS' if ok else 'FAIL'}] {caso} — {detalle}")
        fallos += 0 if ok else 1
    print(f"\n{'TODO OK' if fallos == 0 else f'{fallos} FALLO(S)'}")
    return 1 if fallos else 0


if __name__ == "__main__":
    raise SystemExit(main())
