"""Artículos (líneas) de un pedido para el modal de la parada.

Los pedidos nacen en eFlow; sus líneas (EXPEDICIONESDETALLE + nombre de
ARTICULOSGESTION) las trae la ingesta a `order_items` (ingest_items). Aquí se leen
de Aurora: el modal no depende de que eFlow esté disponible.
"""

from tms_common import pg

_LINEAS = """
SELECT i.product_code, i.product_name, i.quantity, i.weight::float AS weight,
       i.volume::float AS volume, i.guia_fiscal
FROM order_items i JOIN orders o ON o.id = i.order_id
WHERE i.order_id = %s AND o.organization_id = %s
ORDER BY i.line_number"""


def articulos(order_id: str, org: str) -> list[dict]:
    return [{**r, "product_name": r["product_name"] or ""} for r in pg.query(_LINEAS, [order_id, org])]
