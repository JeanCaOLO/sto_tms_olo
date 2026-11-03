"""Pedidos en Bandeja: lo que Planificación tiene para armar viajes.

- delivery = pedidos DISP/DISP de eFlow ya guardados en `orders`.
- pickup   = devoluciones abiertas (`returns` pending/approved, creadas en el TMS o
  en la app del chofer): hay que pasar a recogerlas. Usan los datos del pedido
  original (cliente, zona, dirección) y se etiquetan como devolución en la vista.
"""

from tms_common import pg

_DELIVERY = """
SELECT o.id, 'delivery' AS kind, NULL AS return_number, NULL AS return_reason, NULL AS return_status,
       o.eflow_id_expedicion, o.eflow_id_almacen, o.eflow_id_compania, o.eflow_id_sucursal,
       fc.name AS final_customer_name,
       o.delivery_zone, o.total_amount, o.total_weight, o.total_volume, o.total_items,
       o.observaciones, o.delivery_date, o.order_date, o.wms_status, o.wms_situation,
       o.delivery_date_eflow, o.delivery_date_change_count, o.oms_processed_at IS NOT NULL AS liberado
FROM orders o
LEFT JOIN final_customers fc ON fc.id = o.final_customer_id
WHERE o.organization_id = %s
  AND o.wms_status = 'DISP' AND o.wms_situation = 'DISP'
  AND o.eflow_id_expedicion IS NOT NULL{scope}"""

_PICKUP = """
SELECT r.id, 'pickup' AS kind, r.return_number, r.reason AS return_reason, r.status AS return_status,
       o.eflow_id_expedicion, o.eflow_id_almacen, o.eflow_id_compania, o.eflow_id_sucursal,
       fc.name AS final_customer_name,
       o.delivery_zone, NULL::numeric AS total_amount, NULL::numeric AS total_weight, NULL::numeric AS total_volume,
       r.quantity AS total_items, r.notes AS observaciones, r.created_at::date AS delivery_date,
       r.created_at::date AS order_date, o.wms_status, o.wms_situation,
       NULL::date AS delivery_date_eflow, 0 AS delivery_date_change_count, false AS liberado
FROM returns r
JOIN orders o ON o.id = r.order_id
LEFT JOIN final_customers fc ON fc.id = o.final_customer_id
WHERE r.organization_id = %s AND COALESCE(r.status, 'pending') IN ('pending', 'approved'){scope}"""


def listar(org: str, warehouse: str | None, customer: str | None) -> list[dict]:
    scope, extra = "", []
    if warehouse:
        scope += " AND o.warehouse_id = %s"
        extra.append(warehouse)
    if customer:
        scope += " AND o.customer_id = %s"
        extra.append(customer)
    sql = f"{_DELIVERY.format(scope=scope)}\nUNION ALL\n{_PICKUP.format(scope=scope)}\nORDER BY delivery_date, eflow_id_expedicion"
    return pg.query(sql, [org, *extra, org, *extra])
