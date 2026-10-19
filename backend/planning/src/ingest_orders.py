"""Ingest de pedidos: eFlow (WMS) → Aurora `orders`.

Los pedidos SIEMPRE nacen en eFlow; no existen en Aurora hasta que este ingest
los trae. Planificación planifica SOBRE `orders` (opción A), así que cada corrida
primero sincroniza la cola disponible y luego planifica.

Cola = DISP/DISP (TPEXES=DISP y TPEXSI=DISP), sin cerrar, sin viaje, entrega de
hoy en adelante. UPSERT idempotente por la clave de eFlow
(eflow_id_almacen, eflow_id_compania, eflow_id_sucursal, eflow_id_expedicion):
re-ingestar NO duplica, actualiza estado/fecha/peso.

Read-only contra eFlow; la única escritura es el UPSERT en `orders`.
"""

import sim_eflow_sync
from tms_common import eflow_db, pg

PAIS = "cr"
# Constantes de scope de CR (countries/organizations/warehouses de tms_olo).
ORG_CR = "11111111-1111-1111-1111-111111111111"
WAREHOUSE_CR = "56ce1ef7-cdc5-4b20-89dc-30362101ab3b"


def _eflow_disp_disp(limite: int) -> list[dict]:
    sap = eflow_db.db_names(PAIS).db_sap
    sql = f"""
SELECT TOP (%(limite)s)
  e.IDCOMPANIA, e.IDALMACEN, e.IDSUCURSAL, e.IDEXPEDICION, e.IDCLIENTE,
  e.RUTA, e.PRIORIDAD, e.TPEXES, e.TPEXSI,
  CONVERT(varchar(10), e.FECHAEXPEDICIONPLANIFICADA, 23) AS FECHA,
  e.PESOPEDIDO_TOTAL, e.CUBICAJEPEDIDO_TOTAL,
  cl.DIRECCIONLARGA, cl.LATITUD, cl.LONGITUD
FROM {sap}.dbo.EXPEDICIONESCABECERA e
LEFT JOIN {sap}.dbo.CLIENTES cl
  ON cl.IDCLIENTE = e.IDCLIENTE AND cl.IDCOMPANIA = e.IDCOMPANIA
WHERE e.FECHACIERRE IS NULL AND e.NUMEROVIAJEWMH IS NULL
  AND e.TPEXES = 'DISP' AND e.TPEXSI = 'DISP'
  AND e.FECHAEXPEDICIONPLANIFICADA >= CAST(GETDATE() AS date)
ORDER BY e.FECHAEXPEDICIONPLANIFICADA"""
    return eflow_db.query(PAIS, sql, {"limite": limite})


def _mapa(sql: str, params: list, clave: str, valor: str) -> dict:
    return {str(r[clave]): r[valor] for r in pg.query(sql, params) if r[clave] is not None}


def _lookups(filas: list[dict]) -> tuple[dict, dict, dict]:
    """Precarga los FKs que resuelve el ingest (una query por catálogo)."""
    customers = _mapa(
        "SELECT external_code, id FROM customers WHERE external_code = ANY(%s)",
        [sorted({str(r["IDCOMPANIA"]) for r in filas})], "external_code", "id")
    codigos = sorted({str(r["IDCLIENTE"]) for r in filas if r["IDCLIENTE"] is not None})
    finals = _mapa(
        "SELECT external_code, id FROM final_customers WHERE external_code = ANY(%s)",
        [codigos], "external_code", "id")
    # branch por (customer_id, external_code): la misma sucursal '0001' existe por cliente.
    branches = {
        (str(r["customer_id"]), str(r["external_code"])): r["id"]
        for r in pg.query("SELECT customer_id, external_code, id FROM branches")
        if r["external_code"] is not None
    }
    return customers, finals, branches


_UPSERT = """
INSERT INTO orders (
  organization_id, customer_id, final_customer_id, branch_id, warehouse_id,
  order_number, order_date, delivery_date, planned_dispatch_at,
  total_weight, total_volume, delivery_address, delivery_latitude, delivery_longitude,
  delivery_zone, priority, status, wms_status, wms_situation,
  eflow_id_compania, eflow_id_almacen, eflow_id_sucursal, eflow_id_expedicion, eflow_id_cliente)
VALUES (%s,%s,%s,%s,%s, %s,%s,%s,%s, %s,%s,%s,%s,%s, %s,%s,'pending',%s,%s, %s,%s,%s,%s,%s)
ON CONFLICT (eflow_id_almacen, eflow_id_compania, eflow_id_sucursal, eflow_id_expedicion)
DO UPDATE SET
  delivery_date = EXCLUDED.delivery_date, planned_dispatch_at = EXCLUDED.planned_dispatch_at,
  total_weight = EXCLUDED.total_weight, total_volume = EXCLUDED.total_volume,
  delivery_address = EXCLUDED.delivery_address,
  delivery_latitude = EXCLUDED.delivery_latitude, delivery_longitude = EXCLUDED.delivery_longitude,
  delivery_zone = EXCLUDED.delivery_zone, priority = EXCLUDED.priority,
  wms_status = EXCLUDED.wms_status, wms_situation = EXCLUDED.wms_situation,
  final_customer_id = EXCLUDED.final_customer_id, updated_at = now()"""


def _coord(v) -> float | None:
    try:
        n = float(v)
        return n if n != 0 else None
    except (TypeError, ValueError):
        return None


def _prioridad(v) -> int | None:
    # orders exige priority >= 1 (o NULL). eFlow manda 0 cuando no hay prioridad.
    try:
        n = int(v)
        return n if n >= 1 else None
    except (TypeError, ValueError):
        return None


def ingest_cr(limite: int = 500, dry_run: bool = False) -> dict:
    """Sincroniza la cola DISP/DISP de eFlow CR en `orders`. dry_run no escribe."""
    filas = _eflow_disp_disp(limite)
    customers, finals, branches = _lookups(filas)
    upserted = 0
    faltantes: list[str] = []
    for r in filas:
        customer_id = customers.get(str(r["IDCOMPANIA"]))
        final_id = finals.get(str(r["IDCLIENTE"])) if r["IDCLIENTE"] is not None else None
        branch_id = branches.get((str(customer_id), str(r["IDSUCURSAL"])))
        if not (customer_id and final_id and branch_id):
            faltantes.append(f'{r["IDEXPEDICION"]} (cust={bool(customer_id)} final={bool(final_id)} branch={bool(branch_id)})')
            continue
        if not dry_run:
            pg.query(_UPSERT, [
                ORG_CR, customer_id, final_id, branch_id, WAREHOUSE_CR,
                r["IDEXPEDICION"], r["FECHA"], r["FECHA"], r["FECHA"],
                r["PESOPEDIDO_TOTAL"], r["CUBICAJEPEDIDO_TOTAL"], r["DIRECCIONLARGA"],
                _coord(r["LATITUD"]), _coord(r["LONGITUD"]),
                r["RUTA"], _prioridad(r["PRIORIDAD"]), r["TPEXES"], r["TPEXSI"],
                str(r["IDCOMPANIA"]), str(r["IDALMACEN"]), str(r["IDSUCURSAL"]),
                str(r["IDEXPEDICION"]), str(r["IDCLIENTE"]) if r["IDCLIENTE"] is not None else None,
            ])
        upserted += 1
    # Espejo de la cabecera de eFlow (sim_expedicionescabecera) para el write-back.
    espejadas = 0 if dry_run else sim_eflow_sync.sincronizar()
    return {"leidos": len(filas), "upserted": upserted, "saltados": len(faltantes),
            "espejadas": espejadas, "faltantes": faltantes[:20], "dry_run": dry_run}
