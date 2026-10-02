"""SQL de los adaptadores Aurora (placeholders %s, paramstyle pg8000).

Todas las consultas van parametrizadas: nunca se interpola input de la request
(regla dura de code-quality). Los nombres de tabla siguen el contrato §1/§0
(inglés, snake_case, sin prefijos).
"""

# --- Pedidos planificables (orders + order_items) --------------------------------
# GAP DOCUMENTADO: la clave de zona (`delivery_zone`) y las coordenadas del punto
# de entrega dependen del schema final de WT-1. Se asume orders con
# organization_id, warehouse_id, delivery_date, status y una zona textual; y
# order_items con weight/volume que se agregan a peso/volumen del pedido. Si el
# nombre real difiere, ajustar aquí (única fuente de SQL).
# Modelo: pedido -> punto de entrega -> zona. La zona (para agrupar) y las
# coordenadas (para el mapa y el 2-opt) salen del PUNTO DE ENTREGA
# (delivery_points -> addresses/zones), no de columnas sueltas del pedido.
ORDERS_SQL = """
SELECT o.id,
       o.order_number,
       o.customer_id,
       c.name AS customer_name,
       COALESCE(z.name, dp.wms_zone_code, o.delivery_zone) AS delivery_zone,
       COALESCE(a.city, o.delivery_city) AS delivery_city,
       COALESCE(a.latitude, o.delivery_latitude::numeric)::float  AS delivery_latitude,
       COALESCE(a.longitude, o.delivery_longitude::numeric)::float AS delivery_longitude,
       o.priority,
       agg.total_weight::float AS total_weight,
       agg.total_volume::float AS total_volume
FROM orders o
LEFT JOIN customers c ON c.id = o.customer_id
LEFT JOIN delivery_points dp ON dp.id = o.delivery_point_id
LEFT JOIN addresses a ON a.id = dp.address_id
LEFT JOIN zones z ON z.id = dp.zone_id
LEFT JOIN LATERAL (
    SELECT SUM(i.weight) AS total_weight, SUM(i.volume) AS total_volume
    FROM order_items i
    WHERE i.order_id = o.id
) agg ON true
WHERE o.organization_id = %s
  AND (%s::uuid IS NULL OR c.warehouse_id = %s)
  AND (%s::uuid IS NULL OR o.customer_id = %s)
  AND o.delivery_date = %s::date
  AND o.status IN ('assigned', 'entregado')
ORDER BY o.priority NULLS LAST, delivery_zone, o.order_number
"""

ORDERS_BY_IDS_SQL = """
SELECT o.id, o.order_number, o.customer_id, c.name AS customer_name,
       COALESCE(z.name, dp.wms_zone_code, o.delivery_zone) AS delivery_zone,
       COALESCE(a.city, o.delivery_city) AS delivery_city,
       COALESCE(a.latitude, o.delivery_latitude::numeric)::float AS delivery_latitude,
       COALESCE(a.longitude, o.delivery_longitude::numeric)::float AS delivery_longitude,
       o.priority,
       agg.total_weight::float AS total_weight,
       agg.total_volume::float AS total_volume
FROM orders o
LEFT JOIN customers c ON c.id = o.customer_id
LEFT JOIN delivery_points dp ON dp.id = o.delivery_point_id
LEFT JOIN addresses a ON a.id = dp.address_id
LEFT JOIN zones z ON z.id = dp.zone_id
LEFT JOIN LATERAL (
    SELECT SUM(i.weight) AS total_weight, SUM(i.volume) AS total_volume
    FROM order_items i WHERE i.order_id = o.id
) agg ON true
WHERE o.id = ANY(%s)
"""

# --- Flota (vehicles) ------------------------------------------------------------
VEHICLES_SQL = """
SELECT v.id,
       v.capacity_weight::float AS capacity_weight,
       v.capacity_volume::float AS capacity_volume,
       (v.carrier_id IS NULL) AS is_owned,
       NULL::uuid AS driver_id,
       v.plate AS label
FROM vehicles v
WHERE v.organization_id = %s
  AND v.status = 'active'
ORDER BY (v.carrier_id IS NULL) DESC, v.capacity_weight DESC
"""

# --- Zonas (zones) ---------------------------------------------------------------
ZONES_SQL = """
SELECT z.code
FROM zones z
WHERE z.organization_id = %s
ORDER BY z.code
"""

# --- Planes (route_plans + plan_trips + plan_stops) ------------------------------
INSERT_PLAN_SQL = """
INSERT INTO route_plans (organization_id, country_id, warehouse_id, customer_id,
                         plan_date, status, created_by, notes)
VALUES (%s, %s, %s, %s, %s::date, %s, %s, %s)
RETURNING id
"""

INSERT_TRIP_SQL = """
INSERT INTO plan_trips (plan_id, vehicle_id, driver_id, delivery_zone,
                        sequence_order, total_weight, total_volume,
                        vehicle_plate, vehicle_capacity_weight, vehicle_capacity_volume, is_owned)
VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
RETURNING id
"""

INSERT_STOP_SQL = """
INSERT INTO plan_stops (trip_id, order_id, stop_order,
                        order_number, customer_name, delivery_city, delivery_zone,
                        latitude, longitude, weight, volume)
VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
"""

SELECT_PLAN_SQL = """
SELECT id, organization_id, country_id, warehouse_id, customer_id,
       plan_date::text AS plan_date, status, created_by, notes
FROM route_plans WHERE id = %s
"""

SELECT_TRIPS_SQL = """
SELECT id, vehicle_id, driver_id, delivery_zone, sequence_order,
       total_weight::float AS total_weight, total_volume::float AS total_volume,
       status, vehicle_plate,
       vehicle_capacity_weight::float AS vehicle_capacity_weight,
       vehicle_capacity_volume::float AS vehicle_capacity_volume, is_owned
FROM plan_trips WHERE plan_id = %s ORDER BY sequence_order
"""

# Transición de estado de un viaje. Sin guard de origen: es una corrección
# manual (se puede reabrir un viaje completado/cancelado por error).
UPDATE_TRIP_STATUS_SQL = """
UPDATE plan_trips SET status = %s, updated_at = now()
WHERE id = %s
RETURNING plan_id
"""

SELECT_STOPS_SQL = """
SELECT order_id, stop_order, order_number, customer_name, delivery_city, delivery_zone,
       latitude::float AS latitude, longitude::float AS longitude,
       weight::float AS weight, volume::float AS volume
FROM plan_stops WHERE trip_id = %s ORDER BY stop_order
"""

LIST_PLANS_SQL = """
SELECT id, organization_id, country_id, warehouse_id, customer_id,
       plan_date::text AS plan_date, status, created_by, notes
FROM route_plans
WHERE organization_id = %s
  AND (%s::uuid IS NULL OR warehouse_id = %s)
  AND (%s::text IS NULL OR status = %s)
  AND (%s::date IS NULL OR plan_date = %s::date)
  AND (%s::uuid IS NULL OR customer_id = %s)
ORDER BY plan_date DESC, created_at DESC
LIMIT 30
"""

DELETE_TRIPS_SQL = "DELETE FROM plan_trips WHERE plan_id = %s"

UPDATE_STATUS_SQL = "UPDATE route_plans SET status = %s, updated_at = now() WHERE id = %s"

# --- Introspección: ¿existe la tabla? (para caer a mock si WT-1 no llegó) --------
TABLE_EXISTS_SQL = "SELECT to_regclass(%s) IS NOT NULL AS exists"
