"""Replanificación de TODOS los días pendientes (no solo uno).

Planifica cada día con pedidos DISP/DISP de hoy en adelante. NO toca días que
ya tienen viajes despachados (completed/cancelled): esos quedan como historial.
"""

import plan_builder
from tms_common import pg

# Por (cliente, día): cada compañía tiene su PROPIA planificación (Cofersa ≠ EPA).
_PENDIENTES = """
SELECT DISTINCT customer_id::text AS cust, delivery_date::text AS d
FROM orders
WHERE organization_id = %s AND warehouse_id = %s AND eflow_id_expedicion IS NOT NULL
  AND wms_status = 'DISP' AND wms_situation = 'DISP'
  AND delivery_date >= (now() AT TIME ZONE 'America/Costa_Rica')::date
ORDER BY d, cust"""

_BLOQUEADO = """
SELECT 1 FROM plan_trips t JOIN route_plans p ON p.id = t.plan_id
WHERE p.organization_id = %s AND p.warehouse_id = %s AND p.customer_id = %s AND p.plan_date = %s::date
  AND t.status IN ('completed', 'cancelled')
LIMIT 1"""


def replanificar_todo(org: str, country: str, warehouse: str, created_by: str) -> dict:
    """(Re)planifica todos los días pendientes, POR CLIENTE. Devuelve qué (día/cliente)
    se planificaron y cuáles se saltaron por estar ya despachados."""
    planificados: list[str] = []
    bloqueados: list[str] = []
    for r in pg.query(_PENDIENTES, [org, warehouse]):
        cust, dia = r["cust"], r["d"]
        etiqueta = f"{dia}/{cust[:8]}"
        if pg.query(_BLOQUEADO, [org, warehouse, cust, dia]):
            bloqueados.append(etiqueta)
            continue
        if plan_builder.construir_y_persistir(org, country, warehouse, cust, dia, created_by):
            planificados.append(etiqueta)
    return {"planificados": planificados, "bloqueados": bloqueados}
