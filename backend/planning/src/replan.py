"""Replanificación de los días dentro de la ventana (no solo uno).

Planifica cada día con pedidos DISP/DISP dentro de la ventana de visibilidad:
los próximos HORIZONTE_DIAS a partir de MAÑANA (hoy lunes → martes/miércoles/jueves).
Hoy no se planifica y lo posterior a la ventana no se muestra hasta que avance el
día. NO toca días que ya tienen viajes despachados (completed/cancelled).
"""

import logging
import os

import ingest_orders
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


def en_ventana(dia: str, hoy: str) -> bool:
    """El día (ISO) cae en la ventana que planifica el replan: (hoy, hoy+HORIZONTE_DIAS]."""
    return pg.query("SELECT %s::date > %s::date AND %s::date <= %s::date + %s::int AS ok",
                    [dia, hoy, dia, hoy, HORIZONTE_DIAS])[0]["ok"]


def bloqueado(org: str, warehouse: str, customer: str, dia: str) -> bool:
    """El día ya tiene viajes despachados (completed/cancelled): no se re-arma."""
    return bool(pg.query(_BLOQUEADO, [org, warehouse, customer, dia]))


def replanificar_todo(org: str, country: str, warehouse: str, created_by: str) -> dict:
    """(Re)planifica todos los días pendientes, POR CLIENTE. Devuelve qué (día/cliente)
    se planificaron y cuáles se saltaron por estar ya despachados."""
    planificados: list[str] = []
    bloqueados: list[str] = []
    for r in pg.query(_PENDIENTES, [org, warehouse, HORIZONTE_DIAS]):
        cust, dia = r["cust"], r["d"]
        etiqueta = f"{dia}/{cust[:8]}"
        if bloqueado(org, warehouse, cust, dia):
            bloqueados.append(etiqueta)
            continue
        if plan_builder.construir_y_persistir(org, country, warehouse, cust, dia, created_by):
            planificados.append(etiqueta)
    return {"planificados": planificados, "bloqueados": bloqueados}


# Almacenes con cola: la corrida programada no tiene usuario/almacén de un request.
# Autor (route_plans.created_by es NOT NULL): REPLAN_APP_USER_ID si está, si no el
# app_user activo más antiguo de la org. ponytail: upgrade = un app_user "Sistema".
_ALMACENES = """
SELECT DISTINCT o.organization_id::text AS org, o.warehouse_id::text AS wh, w.country_id::text AS country,
  COALESCE(%s::uuid, (SELECT u.id FROM app_users u WHERE u.organization_id = o.organization_id
                      AND u.is_active ORDER BY u.created_at LIMIT 1))::text AS autor
FROM orders o JOIN warehouses w ON w.id = o.warehouse_id
WHERE o.eflow_id_expedicion IS NOT NULL AND o.wms_status = 'DISP' AND o.wms_situation = 'DISP'"""


def replanificar_programado() -> dict:
    """Corrida horaria (EventBridge Scheduler, ver template): ingesta eFlow y replanifica
    cada almacén con cola."""
    try:
        ingest_orders.ingest_cr()
    except Exception:  # noqa: BLE001 - frontera: no bloquear por eFlow
        logging.getLogger().warning("ingest eFlow no disponible; se replanifica sobre lo ya ingestado")
    almacenes = pg.query(_ALMACENES, [os.environ.get("REPLAN_APP_USER_ID") or None])
    res = {a["wh"]: replanificar_todo(a["org"], a["country"], a["wh"], a["autor"]) for a in almacenes}
    logging.getLogger().info("replan programado: %s", res)
    return res
