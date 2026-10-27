"""Replanificación de los días dentro de la ventana (no solo uno).

Planifica cada día con pedidos DISP/DISP dentro de la ventana de visibilidad:
los próximos HORIZONTE_DIAS a partir de MAÑANA (hoy lunes → martes/miércoles/jueves).
Hoy no se planifica y lo posterior a la ventana no se muestra hasta que avance el
día. NO toca días que ya tienen viajes despachados (completed/cancelled).
"""

import plan_builder
from tms_common import pg

# Ventana de planificación (reunión 2026-10-26): mañana + los siguientes, 3 días en
# total. ponytail: constante fija; hacer configurable por compañía si se pide.
HORIZONTE_DIAS = 3

# Por (cliente, día): cada compañía tiene su PROPIA planificación (Cofersa ≠ EPA).
# Ventana (hoy, hoy+N]: excluye hoy, incluye los N días siguientes.
_PENDIENTES = """
SELECT DISTINCT customer_id::text AS cust, delivery_date::text AS d
FROM orders
WHERE organization_id = %s AND warehouse_id = %s AND eflow_id_expedicion IS NOT NULL
  AND wms_status = 'DISP' AND wms_situation = 'DISP'
  AND delivery_date >  (now() AT TIME ZONE 'America/Costa_Rica')::date
  AND delivery_date <= (now() AT TIME ZONE 'America/Costa_Rica')::date + %s::int
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
    for r in pg.query(_PENDIENTES, [org, warehouse, HORIZONTE_DIAS]):
        cust, dia = r["cust"], r["d"]
        etiqueta = f"{dia}/{cust[:8]}"
        if pg.query(_BLOQUEADO, [org, warehouse, cust, dia]):
            bloqueados.append(etiqueta)
            continue
        if plan_builder.construir_y_persistir(org, country, warehouse, cust, dia, created_by):
            planificados.append(etiqueta)
    return {"planificados": planificados, "bloqueados": bloqueados}
