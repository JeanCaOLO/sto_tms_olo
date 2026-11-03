"""Cambio manual de la fecha de entrega de un pedido (Bandeja, solo admin).

Reunión 2026-11-03: el cliente puede pedir que un pedido salga antes o después.
Lo aprueba un admin y queda registrado quién (orders.delivery_date_changed_by, sql/57;
el historial completo en audit.events). La ingesta de eFlow ya no pisa esa fecha.

No se cambia un pedido ya liberado a eFlow por el OMS: su viaje está congelado
(viajes_liberados) y eFlow ya lo tiene. Tras el cambio se re-arman los días de la
ventana afectados (el viejo y el nuevo) para que el pedido salga de un viaje y entre al otro.
"""

import plan_builder
import replan
from tms_common import pg
from tms_common.errors import HttpError

_PEDIDO = """
SELECT o.id, o.customer_id::text AS cust, o.warehouse_id::text AS wh, w.country_id::text AS country,
       o.delivery_date::text AS fecha, o.oms_processed_at IS NOT NULL AS liberado,
       (now() AT TIME ZONE 'America/Costa_Rica')::date::text AS hoy
FROM orders o JOIN warehouses w ON w.id = o.warehouse_id
WHERE o.id = %s AND o.organization_id = %s AND o.eflow_id_expedicion IS NOT NULL"""

_CAMBIAR = """
UPDATE orders SET delivery_date = %s::date, delivery_date_changed_at = now(), delivery_date_changed_by = %s,
       delivery_date_changes = delivery_date_changes + 1, updated_at = now()
WHERE id = %s"""


def cambiar(order_id: str, org: str, nueva: str, admin_id: str) -> dict:
    rows = pg.query(_PEDIDO, [order_id, org])
    if not rows:
        raise HttpError(404, "Pedido no encontrado")
    p = rows[0]
    if p["liberado"]:
        raise HttpError(409, "El pedido ya fue liberado a eFlow: su fecha no se puede cambiar desde la Bandeja")
    if nueva < p["hoy"]:
        raise HttpError(400, "La fecha de entrega no puede ser anterior a hoy")
    if nueva == p["fecha"]:
        return {"delivery_date": nueva, "replanificados": []}
    pg.query(_CAMBIAR, [nueva, admin_id, order_id])
    hechos = []
    for dia in (p["fecha"], nueva):
        if replan.en_ventana(dia, p["hoy"]) and not replan.bloqueado(org, p["wh"], p["cust"], dia):
            plan_builder.construir_y_persistir(org, p["country"], p["wh"], p["cust"], dia, admin_id)
            hechos.append(dia)
    return {"delivery_date": nueva, "replanificados": hechos}
