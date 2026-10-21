"""Artículos (líneas) de un pedido para el modal de la parada.

Los pedidos nacen en eFlow; sus líneas viven en EXPEDICIONESDETALLE (y el nombre
del artículo en ARTICULOSGESTION). Se leen on-demand y read-only: se resuelve la
clave de eFlow del pedido (orders.eflow_id_*) y se consulta el detalle.
"""

from tms_common import eflow_db, pg

PAIS = "cr"

_KEYS = ("SELECT eflow_id_compania, eflow_id_almacen, eflow_id_sucursal, eflow_id_expedicion "
         "FROM orders WHERE id = %s AND organization_id = %s")


def _articulo(r: dict) -> dict:
    return {
        "product_code": r["IDARTICULO"],
        "product_name": (r["nombre"] or "").strip(),
        "quantity": r["cantidad"] or 0,
        "weight": float(r["peso"]) if r["peso"] is not None else None,
        "volume": float(r["volumen"]) if r["volumen"] is not None else None,
        "guia_fiscal": r["guia"],
    }


def articulos(order_id: str, org: str) -> list[dict]:
    rows = pg.query(_KEYS, [order_id, org])
    if not rows or not rows[0]["eflow_id_expedicion"]:
        return []
    k = rows[0]
    sap = eflow_db.db_names(PAIS).db_sap
    sql = f"""
SELECT d.IDARTICULO, a.DESCRIPCIONLARGA AS nombre, d.UNIDADESPEDIDAS AS cantidad,
       d.PESOPEDIDO AS peso, d.CUBICAJEPEDIDO AS volumen, d.GUIAFISCAL AS guia
FROM {sap}.dbo.EXPEDICIONESDETALLE d
LEFT JOIN {sap}.dbo.ARTICULOSGESTION a
  ON a.IDARTICULO = d.IDARTICULO AND a.IDCOMPANIA = d.IDCOMPANIA
WHERE d.IDEXPEDICION = %(exp)s AND d.IDCOMPANIA = %(comp)s
  AND d.IDALMACEN = %(alm)s AND d.IDSUCURSAL = %(suc)s
ORDER BY d.IDEXPEDICIONLINEA"""
    det = eflow_db.query(PAIS, sql, {
        "exp": k["eflow_id_expedicion"], "comp": k["eflow_id_compania"],
        "alm": k["eflow_id_almacen"], "suc": k["eflow_id_sucursal"],
    })
    return [_articulo(r) for r in det]
