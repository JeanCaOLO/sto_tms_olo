"""Recolectas: el planificador agenda las devoluciones abiertas como paradas
`collection` en un viaje del día que ya pasa por ese cliente o su zona.

Reunión 2026-11-05. v1 sencillo:
- Va en el viaje que ya entrega a ese mismo cliente; si no hay, en uno de su zona
  (o de su tienda, si es EPA). Si ningún viaje del día pasa por ahí, la devolución
  queda sin agendar y se reintenta en el siguiente día que se planifique.
- La parada se pone justo después de las entregas a ese cliente; si no hay, al final.
- No ocupa capacidad: son 1 a 3 artículos y el camión ya bajó carga.
  ponytail: sin peso/volumen de la devolución; agregarlo cuando haya devoluciones grandes.
- El pedido original (order_id) da dirección y coordenadas; no se toca.
"""

_SOLTAR = """
UPDATE tbl_returns r SET pickup_date = NULL, updated_at = now()
FROM tbl_orders o
WHERE o.id = r.order_id AND r.organization_id = %s AND o.warehouse_id = %s AND o.customer_id = %s
  AND r.pickup_date = %s::date AND NOT EXISTS (SELECT 1 FROM tbl_plan_stops s WHERE s.return_id = r.id)"""

# Viajes con camión del día (los liberados también: la recolecta no va a eFlow).
# delivery_zone del viaje = su grupo (zona, o la tienda si es EPA).
_VIAJES = """
SELECT t.id AS trip_id, t.delivery_zone AS clave, array_agg(o.final_customer_id) AS clientes
FROM tbl_plan_trips t
JOIN tbl_route_plans pl ON pl.id = t.plan_id
JOIN tbl_plan_stops s ON s.trip_id = t.id AND s.stop_type = 'delivery'
JOIN tbl_orders o ON o.id = s.order_id
WHERE pl.organization_id = %s AND pl.warehouse_id = %s AND pl.customer_id = %s AND pl.plan_date = %s::date
  AND t.vehicle_id IS NOT NULL AND t.status = 'pending'
GROUP BY t.id, t.delivery_zone, t.sequence_order
ORDER BY t.sequence_order"""

_ABIERTAS = """
SELECT r.id AS return_id, r.return_number, o.id AS order_id, o.final_customer_id, o.delivery_zone, o.delivery_city,
       o.delivery_latitude AS lat, o.delivery_longitude AS lng, fc.name AS customer_name, fc.customer_type
FROM tbl_returns r
JOIN tbl_orders o ON o.id = r.order_id
LEFT JOIN tbl_final_customers fc ON fc.id = o.final_customer_id
WHERE r.organization_id = %s AND o.warehouse_id = %s AND o.customer_id = %s
  AND COALESCE(r.status, 'pending') IN ('pending', 'approved')
  AND (r.pickup_date IS NULL OR r.pickup_date = %s::date)
  AND NOT EXISTS (SELECT 1 FROM tbl_plan_stops s WHERE s.return_id = r.id)
ORDER BY r.created_at"""

# Posición: tras la última entrega a ese cliente en el viaje; si no hay, al final.
_POSICION = """
SELECT COALESCE(max(s.stop_order) FILTER (WHERE o.final_customer_id = %s), max(s.stop_order), 0) AS pos
FROM tbl_plan_stops s JOIN tbl_orders o ON o.id = s.order_id WHERE s.trip_id = %s"""
_CORRER = "UPDATE tbl_plan_stops SET stop_order = stop_order + 1 WHERE trip_id = %s AND stop_order > %s"
_INS = """
INSERT INTO tbl_plan_stops (trip_id, order_id, stop_order, order_number, customer_name, delivery_city,
  delivery_zone, latitude, longitude, weight, volume, es_cliente_retira, stop_type, return_id)
VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,NULL,NULL,false,'collection',%s)"""
_AGENDAR = "UPDATE tbl_returns SET pickup_date = %s::date, updated_at = now() WHERE id = %s"


def elegir_viaje(devolucion: dict, viajes: list[dict], clave) -> str | None:
    """Viaje que entrega al mismo cliente; si no hay, el primero de su grupo (zona o tienda)."""
    for v in viajes:
        if devolucion["final_customer_id"] in (v["clientes"] or []):
            return v["trip_id"]
    grupo = clave(devolucion)
    return next((v["trip_id"] for v in viajes if v["clave"] == grupo), None)


def agendar(run, org: str, warehouse: str, customer: str, fecha: str, clave) -> int:
    """Mete las devoluciones abiertas en los viajes con camión del día (compañía `customer`).
    `clave(o)` = grupo del planificador (zona o tienda). Devuelve cuántas quedaron agendadas."""
    p = [org, warehouse, customer, fecha]
    run(_SOLTAR, p)  # las del día que perdieron su parada en el replan vuelven a estar libres
    viajes = run(_VIAJES, p)
    agendadas = 0
    for d in run(_ABIERTAS, p):
        trip_id = elegir_viaje(d, viajes, clave)
        if trip_id is None:
            continue
        pos = run(_POSICION, [d["final_customer_id"], trip_id])[0]["pos"]
        run(_CORRER, [trip_id, pos])
        run(_INS, [trip_id, d["order_id"], pos + 1, d["return_number"], d["customer_name"], d["delivery_city"],
                   d["delivery_zone"], d["lat"], d["lng"], d["return_id"]])
        run(_AGENDAR, [fecha, d["return_id"]])
        agendadas += 1
    return agendadas
