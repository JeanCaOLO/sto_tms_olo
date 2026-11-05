"""Viajes ya liberados a eFlow: el replan NO los toca.

Un viaje queda CONGELADO en cuanto el OMS liberó alguno de sus pedidos
(`orders.oms_processed_at` sellado + situación GENE, ADR-013): eFlow ya tiene su nº
de viaje. El replan borra y re-arma solo lo no liberado del día y numera a
continuación del último nº usado, para no reusar un nº que eFlow ya conoce.
"""

_DIA = "organization_id=%s AND warehouse_id=%s AND customer_id=%s AND plan_date=%s::date"
_PLANES_DEL_DIA = f"SELECT id FROM tbl_route_plans WHERE {_DIA}"


def _liberado(trip: str) -> str:
    """El viaje `trip` tiene al menos un pedido ya liberado a eFlow."""
    return f"""EXISTS (SELECT 1 FROM tbl_plan_stops s2 JOIN tbl_orders o2 ON o2.id = s2.order_id
              WHERE s2.trip_id = {trip} AND o2.oms_processed_at IS NOT NULL)"""


def fuera_de_congelados(order: str) -> str:
    """Filtro: el pedido `order` no está en un viaje congelado (si lo está, se queda ahí)."""
    return f"NOT EXISTS (SELECT 1 FROM tbl_plan_stops s WHERE s.order_id = {order} AND {_liberado('s.trip_id')})"


def borrar_no_liberado(run, org: str, warehouse: str, customer: str, fecha: str) -> None:
    """Borra del día los viajes sin pedidos liberados y suelta (NULL) sus pedidos;
    si siguen en la cola, el replan los re-estampa. Los congelados quedan intactos."""
    p = [org, warehouse, customer, fecha]
    run(f"""DELETE FROM tbl_plan_stops WHERE trip_id IN (SELECT t.id FROM tbl_plan_trips t
             WHERE t.plan_id IN ({_PLANES_DEL_DIA}) AND NOT {_liberado('t.id')})""", p)
    run(f"""DELETE FROM tbl_plan_trips t WHERE t.plan_id IN ({_PLANES_DEL_DIA})
             AND NOT EXISTS (SELECT 1 FROM tbl_plan_stops s WHERE s.trip_id = t.id)""", p)
    run(f"""DELETE FROM tbl_route_plans pl WHERE {_DIA}
             AND NOT EXISTS (SELECT 1 FROM tbl_plan_trips t WHERE t.plan_id = pl.id)""", p)
    # Pedidos caídos del plan vuelven a NULL (OMS): por delivery_date O por nº de viaje del
    # día (alcanza a los que cambiaron de fecha). Nunca un pedido liberado o de viaje congelado.
    run(f"""UPDATE tbl_orders AS orders SET planning_run_id=NULL, numero_viaje=NULL, dispatch_date=NULL, lead_time_days=NULL, updated_at=now()
             WHERE organization_id=%s AND warehouse_id=%s AND customer_id=%s
               AND (delivery_date=%s::date OR numero_viaje LIKE %s) AND planning_run_id IS NOT NULL
               AND oms_processed_at IS NULL AND {fuera_de_congelados('orders.id')}""",
        p + [f"{fecha.replace('-', '')}-%"])


_ULTIMO = f"""SELECT pl.id, max(split_part(t.numero_viaje, '-', 2)::int) AS ultimo
FROM tbl_route_plans pl JOIN tbl_plan_trips t ON t.plan_id = pl.id
WHERE pl.id IN ({_PLANES_DEL_DIA}) GROUP BY pl.id ORDER BY ultimo DESC NULLS LAST LIMIT 1"""


def plan_vigente(run, org: str, warehouse: str, customer: str, fecha: str) -> tuple[str | None, int]:
    """(plan que conserva viajes congelados, último nº de viaje usado), o (None, 0)."""
    rows = run(_ULTIMO, [org, warehouse, customer, fecha])
    return (str(rows[0]["id"]), rows[0]["ultimo"] or 0) if rows else (None, 0)
