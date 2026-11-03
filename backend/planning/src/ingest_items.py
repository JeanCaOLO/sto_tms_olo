"""Ingest de artículos: eFlow EXPEDICIONESDETALLE → Aurora `order_items` (sql/44).

Corre dentro de `ingest_orders.ingest_cr`, después del UPSERT de cabeceras. Toma:
- los pedidos de la cola DISP/DISP recién leída, NO liberados por el OMS (sus líneas
  pueden cambiar en eFlow hasta que se liberan; liberado = se congelan), y
- los pedidos de Aurora que aún no tienen líneas (backfill, cualquier estado en eFlow).
UPSERT por (order_id, line_number) que solo escribe si algo cambió (no ensucia la
auditoría de order_items) y borra las líneas que eFlow ya no trae.
"""

import json

from tms_common import eflow_db, pg

PAIS = "cr"
LOTE = 500  # IDEXPEDICION por query a SQL Server (tope de parámetros: 2100)

_DESTINO = """
SELECT o.id::text AS order_id, o.eflow_id_compania AS comp, o.eflow_id_almacen AS alm,
       o.eflow_id_sucursal AS suc, o.eflow_id_expedicion AS exp
FROM orders o
WHERE o.organization_id = %s AND o.eflow_id_expedicion IS NOT NULL
  AND ((o.eflow_id_expedicion = ANY(%s) AND o.oms_processed_at IS NULL)
       OR NOT EXISTS (SELECT 1 FROM order_items i WHERE i.order_id = o.id))"""

_COLS = ("order_id uuid, line_number int, product_code text, product_name text, presentation text, lot text,"
         " quantity int, quantity_prepared int, quantity_loaded int, quantity_cancelled int,"
         " weight numeric, volume numeric, guia_fiscal text, expiry_date date, wms_status text, wms_situation text")
_CAMPOS = [c.split()[0] for c in _COLS.split(",")]
_ACTUALIZABLES = [c for c in _CAMPOS if c not in ("order_id", "line_number")]

_UPSERT = f"""
INSERT INTO order_items ({", ".join(_CAMPOS)})
SELECT {", ".join(_CAMPOS)} FROM jsonb_to_recordset(%s::jsonb) AS x({_COLS})
ON CONFLICT (order_id, line_number) DO UPDATE SET {", ".join(f"{c} = EXCLUDED.{c}" for c in _ACTUALIZABLES)}
WHERE ({", ".join(f"order_items.{c}" for c in _ACTUALIZABLES)})
      IS DISTINCT FROM ({", ".join(f"EXCLUDED.{c}" for c in _ACTUALIZABLES)})"""

_BORRAR_SOBRANTES = """
WITH nuevas AS (SELECT * FROM jsonb_to_recordset(%s::jsonb) AS x(order_id uuid, line_number int))
DELETE FROM order_items oi WHERE oi.order_id IN (SELECT order_id FROM nuevas)
  AND NOT EXISTS (SELECT 1 FROM nuevas n WHERE n.order_id = oi.order_id AND n.line_number = oi.line_number)"""


def _detalle_eflow(expediciones: list[str]) -> list[dict]:
    sap = eflow_db.db_names(PAIS).db_sap
    marcas = ", ".join(f"%(e{i})s" for i in range(len(expediciones)))
    # Nombre como VARBINARY: los varchar de eFlow son cp1252 y pytds los decodifica mal.
    sql = f"""
SELECT d.IDCOMPANIA, d.IDALMACEN, d.IDSUCURSAL, d.IDEXPEDICION, d.IDEXPEDICIONLINEA, d.IDARTICULO,
  CONVERT(VARBINARY(400), a.DESCRIPCIONLARGA) AS NOMBRE, d.IDPRESENTACION, d.LOTEEXPECIFICO,
  d.UNIDADESPEDIDAS, d.UNIDADESPREPARADAS, d.UNIDADESCARGADAS, d.UNIDADESANULADAS,
  d.PESOPEDIDO, d.CUBICAJEPEDIDO, d.GUIAFISCAL, CONVERT(varchar(10), d.FECHACADUCIDAD, 23) AS CADUCIDAD,
  d.TPEXES, d.TPEXSI
FROM {sap}.dbo.EXPEDICIONESDETALLE d
LEFT JOIN {sap}.dbo.ARTICULOSGESTION a ON a.IDARTICULO = d.IDARTICULO AND a.IDCOMPANIA = d.IDCOMPANIA
WHERE d.IDEXPEDICION IN ({marcas})"""
    return eflow_db.query(PAIS, sql, {f"e{i}": e for i, e in enumerate(expediciones)})


def _linea(order_id: str, d: dict) -> dict:
    nombre = d["NOMBRE"].decode("cp1252").strip() if d["NOMBRE"] else None
    return {
        "order_id": order_id, "line_number": d["IDEXPEDICIONLINEA"], "product_code": str(d["IDARTICULO"]),
        "product_name": nombre, "presentation": d["IDPRESENTACION"], "lot": d["LOTEEXPECIFICO"],
        "quantity": d["UNIDADESPEDIDAS"] or 0, "quantity_prepared": d["UNIDADESPREPARADAS"],
        "quantity_loaded": d["UNIDADESCARGADAS"], "quantity_cancelled": d["UNIDADESANULADAS"],
        "weight": float(d["PESOPEDIDO"]) if d["PESOPEDIDO"] is not None else None,
        "volume": float(d["CUBICAJEPEDIDO"]) if d["CUBICAJEPEDIDO"] is not None else None,
        "guia_fiscal": d["GUIAFISCAL"], "expiry_date": d["CADUCIDAD"],
        "wms_status": d["TPEXES"], "wms_situation": d["TPEXSI"],
    }


def sincronizar(org: str, cola: list[str]) -> int:
    """Trae de eFlow las líneas de los pedidos destino y las guarda. Devuelve cuántas líneas."""
    destino = {(r["comp"], r["alm"], r["suc"], r["exp"]): r["order_id"] for r in pg.query(_DESTINO, [org, cola])}
    exps = sorted({k[3] for k in destino})
    lineas = []
    for i in range(0, len(exps), LOTE):
        for d in _detalle_eflow(exps[i:i + LOTE]):
            order_id = destino.get((str(d["IDCOMPANIA"]), str(d["IDALMACEN"]), str(d["IDSUCURSAL"]), str(d["IDEXPEDICION"])))
            if order_id:
                lineas.append(_linea(order_id, d))
    if lineas:
        payload = json.dumps(lineas)
        pg.run_in_transaction(lambda run: (run(_UPSERT, [payload]), run(_BORRAR_SOBRANTES, [payload])))
    return len(lineas)
