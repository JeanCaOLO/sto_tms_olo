"""Ingest de pedidos: eFlow (WMS) → Aurora `orders`.

Los pedidos SIEMPRE nacen en eFlow; no existen en Aurora hasta que este ingest
los trae. Planificación planifica SOBRE `orders` (opción A), así que cada corrida
primero sincroniza la cola disponible y luego planifica.

Cola = DISP/DISP (TPEXES=DISP y TPEXSI=DISP), sin cerrar, sin viaje, entrega de
hoy en adelante. UPSERT idempotente por la clave de eFlow
(eflow_id_almacen, eflow_id_compania, eflow_id_sucursal, eflow_id_expedicion):
re-ingestar NO duplica, actualiza estado/fecha/peso.

Read-only contra eFlow; escribe el UPSERT en `orders` y sus líneas en `order_items`
(ingest_items).

FLAG `EFLOW_API_MODE` (tms_common.eflow_api): `mock` (default) lee por SQL como siempre;
`qa` lee la cola por el API REST de eFlow QA (ObtenerExpediciones). El API NO trae peso,
volumen, líneas, dirección, coordenadas ni ruta: en `qa` esas columnas se CONSERVAN si el
pedido ya existe (COALESCE) y quedan NULL si es nuevo; no se espeja a sim_expedicionescabecera
ni se leen líneas (no hay API para eso).
"""
import os
from datetime import date, timedelta

import cliente_retira
import ingest_items
import salientes
import sim_eflow_sync
from tms_common import eflow_api, eflow_db, pg

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
  e.PESOPEDIDO_TOTAL, e.CUBICAJEPEDIDO_TOTAL, e.COSTO_TOTAL,
  e.OBSERVACIONESEXPEDICION AS OBSERVACIONES,
  (SELECT COUNT(*) FROM {sap}.dbo.EXPEDICIONESDETALLE d
   WHERE d.IDEXPEDICION = e.IDEXPEDICION AND d.IDCOMPANIA = e.IDCOMPANIA
     AND d.IDALMACEN = e.IDALMACEN AND d.IDSUCURSAL = e.IDSUCURSAL) AS CANT_LINEAS,
  cl.DIRECCIONLARGA, cl.LATITUD, cl.LONGITUD
FROM {sap}.dbo.EXPEDICIONESCABECERA e
LEFT JOIN {sap}.dbo.CLIENTES cl
  ON cl.IDCLIENTE = e.IDCLIENTE AND cl.IDCOMPANIA = e.IDCOMPANIA
WHERE e.FECHACIERRE IS NULL AND e.NUMEROVIAJEWMH IS NULL
  AND e.TPEXES = 'DISP' AND e.TPEXSI = 'DISP'
  AND e.FECHAEXPEDICIONPLANIFICADA >= CAST(GETDATE() AS date)
ORDER BY e.FECHAEXPEDICIONPLANIFICADA"""
    return eflow_db.query(PAIS, sql, {"limite": limite})


def _eflow_api_disp_disp(limite: int) -> list[dict]:
    """Cola DISP/DISP desde el API de eFlow QA, con la forma de fila que espera el ingest.

    El API filtra por rango de fechas: se pide una ventana ancha (EFLOW_API_DIAS_ATRAS /
    EFLOW_API_DIAS_ADELANTE, 30 por defecto) y se aplican aquí las mismas reglas que el SQL:
    sin viaje asignado y fecha planificada de hoy en adelante."""
    hoy = date.today()
    atras = int(os.environ.get("EFLOW_API_DIAS_ATRAS", "30"))
    adelante = int(os.environ.get("EFLOW_API_DIAS_ADELANTE", "30"))
    items = eflow_api.obtener_expediciones(hoy - timedelta(days=atras), hoy + timedelta(days=adelante), "DISP", "DISP")
    filas = []
    for it in items:
        fecha = str(it.get("fechaExpedicionPlanificada") or "")[:10]
        if not fecha or fecha < hoy.isoformat() or it.get("numeroViajeWmh") is not None:
            continue
        filas.append({
            "IDCOMPANIA": it["idCompania"], "IDALMACEN": it["idAlmacen"], "IDSUCURSAL": it["idSucursal"],
            "IDEXPEDICION": it["idExpedicion"], "IDCLIENTE": it.get("idCliente"), "RUTA": None,
            "PRIORIDAD": it.get("prioridad"), "TPEXES": it.get("estado"), "TPEXSI": it.get("situacion"),
            "FECHA": fecha, "PESOPEDIDO_TOTAL": None, "CUBICAJEPEDIDO_TOTAL": None, "COSTO_TOTAL": None,
            "OBSERVACIONES": it.get("observaciones"), "CANT_LINEAS": None,
            "DIRECCIONLARGA": None, "LATITUD": None, "LONGITUD": None})
    filas.sort(key=lambda r: r["FECHA"])
    return filas[:limite]


def _mapa(sql: str, params: list, clave: str, valor: str) -> dict:
    return {str(r[clave]): r[valor] for r in pg.query(sql, params) if r[clave] is not None}


def _lookups(filas: list[dict]) -> tuple[dict, dict, dict]:
    """Precarga los FKs que resuelve el ingest (una query por catálogo)."""
    customers = _mapa(
        "SELECT external_code, id FROM tbl_customers WHERE external_code = ANY(%s)",
        [sorted({str(r["IDCOMPANIA"]) for r in filas})], "external_code", "id")
    codigos = sorted({str(r["IDCLIENTE"]) for r in filas if r["IDCLIENTE"] is not None})
    # final por (customer_id, external_code): el código '008' es T008 de EPA y también un cliente de Cofersa.
    finals = {
        (str(r["customer_id"]), str(r["external_code"])): r["id"]
        for r in pg.query("SELECT customer_id, external_code, id FROM tbl_final_customers WHERE external_code = ANY(%s)", [codigos])
    }
    # branch por (customer_id, external_code): la misma sucursal '0001' existe por cliente.
    branches = {
        (str(r["customer_id"]), str(r["external_code"])): r["id"]
        for r in pg.query("SELECT customer_id, external_code, id FROM tbl_branches")
        if r["external_code"] is not None
    }
    return customers, finals, branches


# Punto de entrega por defecto del cliente destino en Aurora (tbl_delivery_points → tbl_addresses).
# El API de eFlow no trae coordenadas ni dirección: se toman de aquí por el cliente (IDCLIENTE → final_customer).
_PUNTOS = """
SELECT DISTINCT ON (dp.final_customer_id) dp.final_customer_id, a.latitude, a.longitude, a.line1
FROM tbl_delivery_points dp JOIN tbl_addresses a ON a.id = dp.address_id
WHERE dp.final_customer_id = ANY(%s) AND dp.active AND a.latitude IS NOT NULL AND a.longitude IS NOT NULL
ORDER BY dp.final_customer_id, dp.is_default DESC, dp.created_at"""


def _puntos_entrega(final_ids: list) -> dict:
    """{final_customer_id: (lat, lng, dirección)} del punto de entrega por defecto de cada cliente."""
    if not final_ids:
        return {}
    return {str(r["final_customer_id"]): (r["latitude"], r["longitude"], r["line1"])
            for r in pg.query(_PUNTOS, [sorted({str(f) for f in final_ids})])}


def _completar_ubicacion(r: dict, punto: tuple | None) -> tuple:
    """(dirección, lat, lng) del pedido: lo de eFlow si es válido; si no, el punto de entrega de Aurora."""
    lat, lng = _coord(r["LATITUD"], 90), _coord(r["LONGITUD"], 180)
    if (lat is None or lng is None) and punto:
        return r["DIRECCIONLARGA"] or punto[2], float(punto[0]), float(punto[1])
    return r["DIRECCIONLARGA"], lat, lng


_UPSERT = """
INSERT INTO tbl_orders AS orders (
  organization_id, customer_id, final_customer_id, branch_id, warehouse_id,
  order_number, order_date, delivery_date, delivery_date_eflow, planned_dispatch_at,
  total_weight, total_volume, total_items, total_amount, delivery_address, delivery_latitude, delivery_longitude,
  delivery_zone, priority, status, wms_status, wms_situation,
  observaciones, es_cliente_retira,
  eflow_id_compania, eflow_id_almacen, eflow_id_sucursal, eflow_id_expedicion, eflow_id_cliente)
VALUES (%s,%s,%s,%s,%s, %s,%s,%s,%s,%s, %s,%s,%s,%s,%s,%s,%s, %s,%s,'pending',%s,%s, %s,%s, %s,%s,%s,%s,%s)
ON CONFLICT (eflow_id_almacen, eflow_id_compania, eflow_id_sucursal, eflow_id_expedicion)
DO UPDATE SET
  -- Fecha cambiada a mano en la Bandeja (sql/57): eFlow ya no la pisa; lo suyo queda en delivery_date_eflow.
  delivery_date = CASE WHEN orders.delivery_date_changed_at IS NULL THEN EXCLUDED.delivery_date ELSE orders.delivery_date END,
  delivery_date_eflow = EXCLUDED.delivery_date_eflow, planned_dispatch_at = EXCLUDED.planned_dispatch_at,
  -- COALESCE: el API REST de eFlow (EFLOW_API_MODE=qa) no trae estos campos; si llegan NULL se conserva lo ya cargado.
  total_weight = COALESCE(EXCLUDED.total_weight, orders.total_weight),
  total_volume = COALESCE(EXCLUDED.total_volume, orders.total_volume),
  total_items = COALESCE(EXCLUDED.total_items, orders.total_items),
  total_amount = COALESCE(EXCLUDED.total_amount, orders.total_amount),
  delivery_address = COALESCE(EXCLUDED.delivery_address, orders.delivery_address),
  delivery_latitude = COALESCE(EXCLUDED.delivery_latitude, orders.delivery_latitude),
  delivery_longitude = COALESCE(EXCLUDED.delivery_longitude, orders.delivery_longitude),
  delivery_zone = COALESCE(EXCLUDED.delivery_zone, orders.delivery_zone), priority = EXCLUDED.priority,
  wms_status = EXCLUDED.wms_status, wms_situation = EXCLUDED.wms_situation,
  observaciones = EXCLUDED.observaciones, es_cliente_retira = EXCLUDED.es_cliente_retira,
  final_customer_id = EXCLUDED.final_customer_id, updated_at = now()
-- Liberado por el OMS = congelado: eFlow real sigue en DISP/DISP (el OMS aún no le escribe) y
-- pisaba el GENE del OMS y los datos de un viaje ya liberado. Tras liberar, la ingesta no lo toca.
WHERE orders.oms_processed_at IS NULL"""


def _coord(v, limite: float) -> float | None:
    """Coordenada válida o None. eFlow trae a veces el valor sin punto decimal
    (p. ej. -83943225 por -83.943225): fuera de rango se descarta en vez de
    romper el upsert de toda la bandeja (numeric(11,8))."""
    try:
        n = float(v)
    except (TypeError, ValueError):
        return None
    return n if n != 0 and abs(n) <= limite else None


def _prioridad(v) -> int | None:
    # Se CONSERVA la prioridad que manda eFlow tal cual (incluido 0): el OMS debe
    # devolverle ese mismo valor a eFlow. Para las compañías pass-through (EPA) es la
    # única prioridad que tienen (el OMS no las re-prioriza) y se mantiene end-to-end.
    # `orders.priority` admite `>= 0` (ck_order_priority, sql/57). Solo valores
    # negativos/no numéricos caen a NULL (no deberían venir de eFlow).
    try:
        n = int(v)
        return n if n >= 0 else None
    except (TypeError, ValueError):
        return None


def ingest_cr(limite: int = 500, dry_run: bool = False) -> dict:
    """Sincroniza la cola DISP/DISP de eFlow CR en `orders`. dry_run no escribe."""
    qa = eflow_api.activo()
    filas = _eflow_api_disp_disp(limite) if qa else _eflow_disp_disp(limite)
    customers, finals, branches = _lookups(filas)
    puntos = _puntos_entrega(list(finals.values()))
    upserted = 0
    faltantes: list[str] = []
    for r in filas:
        customer_id = customers.get(str(r["IDCOMPANIA"]))
        final_id = finals.get((str(customer_id), str(r["IDCLIENTE"]))) if r["IDCLIENTE"] is not None else None
        branch_id = branches.get((str(customer_id), str(r["IDSUCURSAL"])))
        if not (customer_id and final_id and branch_id):
            faltantes.append(f'{r["IDEXPEDICION"]} (cust={bool(customer_id)} final={bool(final_id)} branch={bool(branch_id)})')
            continue
        direccion, lat, lng = _completar_ubicacion(r, puntos.get(str(final_id)))
        if not dry_run:
            pg.query(_UPSERT, [
                ORG_CR, customer_id, final_id, branch_id, WAREHOUSE_CR,
                r["IDEXPEDICION"], r["FECHA"], r["FECHA"], r["FECHA"], r["FECHA"],
                r["PESOPEDIDO_TOTAL"], r["CUBICAJEPEDIDO_TOTAL"], r["CANT_LINEAS"], r["COSTO_TOTAL"], direccion, lat, lng,
                r["RUTA"], _prioridad(r["PRIORIDAD"]), r["TPEXES"], r["TPEXSI"],
                r["OBSERVACIONES"], cliente_retira.es_cliente_retira(r["OBSERVACIONES"]),
                str(r["IDCOMPANIA"]), str(r["IDALMACEN"]), str(r["IDSUCURSAL"]),
                str(r["IDEXPEDICION"]), str(r["IDCLIENTE"]) if r["IDCLIENTE"] is not None else None,
            ])
        upserted += 1
    # Los que salieron de la cola (despachados/cerrados en eFlow) dejan la bandeja.
    # En `qa` no hay lectura por llave en el API (ObtenerExpediciones exige estado+situación): no se refrescan.
    salidos = 0 if (dry_run or qa) else salientes.refrescar(
        PAIS, ORG_CR, {(str(r["IDEXPEDICION"]), str(r["IDCOMPANIA"])) for r in filas})
    # Espejo de la cabecera de eFlow (sim_expedicionescabecera) para el write-back.
    espejadas = 0 if (dry_run or qa) else sim_eflow_sync.sincronizar()
    lineas = 0 if (dry_run or qa) else ingest_items.sincronizar(ORG_CR, [str(r["IDEXPEDICION"]) for r in filas])
    return {"leidos": len(filas), "upserted": upserted, "saltados": len(faltantes), "salidos": salidos, "espejadas": espejadas,
            "lineas": lineas, "faltantes": faltantes[:20], "dry_run": dry_run, "fuente": eflow_api.modo()}
