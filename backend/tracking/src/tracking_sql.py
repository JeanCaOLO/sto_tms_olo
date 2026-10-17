"""SQL del tracking en vivo (monitoreo). Placeholders `%s` (pg8000)."""

ORG_SQL = "SELECT organization_id FROM app_users WHERE id = %s"

# Entrega (delivered/failed) según delivery_status y, de respaldo, status (datos de scripts viejos).
_GUIDE_STATE = "lower(coalesce(g.delivery_status, g.status, ''))"
DELIVERED_SQL = "('delivered', 'entregado', 'completada')"
FAILED_SQL = "('failed', 'fallido')"

# Evidencias que el módulo acepta (factura firmada y firma). Las filas antiguas de otros tipos no se leen.
EVIDENCE_KINDS_SQL = "('photo_invoice', 'signature')"

VIAJE_COLUMNS = """
  r.id, r.route_number, r.route_date, r.status, r.actual_start_time, r.actual_end_time,
  r.planned_end_time, r.created_at, r.departed_at,
  s.country_id, s.name AS origin_name, s.latitude AS origin_lat, s.longitude AS origin_lng,
  co.code AS country, co.timezone AS timezone,
  d.full_name AS driver_name, v.plate, z.name AS zone_name,
  lp.latitude AS last_lat, lp.longitude AS last_lng, lp.speed_mps,
  lp.recorded_at AS last_position_at,
  COALESCE(r.actual_start_time, r.created_at) AS sort_at
"""

VIAJE_JOINS = """
FROM routes r
JOIN stores s ON s.id = r.store_id
JOIN countries co ON co.id = s.country_id
LEFT JOIN drivers d ON d.id = r.driver_id
LEFT JOIN vehicles v ON v.id = r.vehicle_id
LEFT JOIN zones z ON z.id = r.route_type_id
LEFT JOIN tracking_last_positions lp ON lp.route_id = r.id
"""

# Progreso por ruta, calculado de las guías (no del contador denormalizado completed_stops).
PROGRESS_SQL = f"""
SELECT g.route_id,
       count(*) AS total,
       count(*) FILTER (WHERE {_GUIDE_STATE} IN {DELIVERED_SQL}) AS delivered,
       count(*) FILTER (WHERE {_GUIDE_STATE} IN {FAILED_SQL}) AS failed
FROM dispatch_guides g
WHERE g.route_id = ANY(%s::uuid[])
GROUP BY g.route_id
"""

# Paradas con coordenadas para el ETA de la PRÓXIMA parada pendiente (lote: todas las rutas de la página).
STOPS_BATCH_SQL = """
SELECT g.route_id, g.id, g.sequence_number, g.delivery_status, g.status, g.planned_arrival_time,
       COALESCE(o.delivery_latitude, ps.latitude) AS latitude,
       COALESCE(o.delivery_longitude, ps.longitude) AS longitude
FROM dispatch_guides g
JOIN routes r ON r.id = g.route_id
LEFT JOIN orders o ON o.id = g.order_id
LEFT JOIN plan_stops ps ON ps.trip_id = r.plan_trip_id AND ps.order_id = g.order_id
WHERE g.route_id = ANY(%s::uuid[])
"""

# Posiciones recientes (ventana de STOPPED_WINDOW_MIN) para medir cuánto lleva detenido cada camión.
# Usa el índice (route_id, recorded_at desc); excluye mock y precisión mala, igual que la posición.
STOPPED_POSITIONS_SQL = """
SELECT route_id, latitude, longitude, recorded_at FROM tracking_positions
WHERE route_id = ANY(%s::uuid[]) AND recorded_at >= %s::timestamptz
  AND NOT is_mock AND (accuracy_m IS NULL OR accuracy_m <= 200)
ORDER BY route_id, recorded_at
"""

# Viajes completados hoy (día local del país). `where` lo arma app.py con el alcance (org, país, día).
COMPLETED_TODAY_SQL = """
SELECT count(*) AS n
FROM routes r
JOIN stores s ON s.id = r.store_id
JOIN countries co ON co.id = s.country_id
WHERE {where}
"""


SET_DEPARTED_SQL = "UPDATE routes SET departed_at = %s WHERE id = %s AND departed_at IS NULL"

ROUTE_ONE_SQL = f"SELECT {VIAJE_COLUMNS} {VIAJE_JOINS} WHERE r.id = %s"

GUIDES_SQL = """
SELECT g.id, g.guide_number, g.sequence_number, g.status, g.delivery_status,
       g.actual_arrival_time, g.planned_arrival_time, g.recipient_name,
       o.id AS order_id, o.order_number, o.invoice_number, o.total_items, o.total_weight,
       o.delivery_address, o.delivery_city,
       COALESCE(o.delivery_latitude, ps.latitude) AS latitude,
       COALESCE(o.delivery_longitude, ps.longitude) AS longitude,
       cu.name AS customer_name, cu.phone AS customer_phone
FROM dispatch_guides g
JOIN routes r ON r.id = g.route_id
JOIN orders o ON o.id = g.order_id
LEFT JOIN customers cu ON cu.id = o.customer_id
LEFT JOIN plan_stops ps ON ps.trip_id = r.plan_trip_id AND ps.order_id = g.order_id
WHERE g.route_id = %s
ORDER BY g.sequence_number
"""

EVIDENCES_SQL = f"""
SELECT id, dispatch_guide_id, kind, storage_key, mime_type, captured_at
FROM tracking_evidences WHERE route_id = %s AND kind IN {EVIDENCE_KINDS_SQL} ORDER BY created_at
"""

# Recorrido completo para el replay: solo puntos que cuentan (sin mock ni precisión mala), cronológicos.
TRAIL_REPLAY_SQL = """
SELECT latitude, longitude, recorded_at FROM tracking_positions
WHERE route_id = %s AND NOT is_mock AND (accuracy_m IS NULL OR accuracy_m <= 200)
ORDER BY recorded_at
"""

PLANNED_SQL = """
SELECT pt.id AS plan_trip_id, rp.plan_date, pt.delivery_zone, v.plate, d.full_name AS driver_name,
       (SELECT count(*) FROM plan_stops ps WHERE ps.trip_id = pt.id) AS stops
FROM plan_trips pt
JOIN route_plans rp ON rp.id = pt.plan_id
LEFT JOIN vehicles v ON v.id = pt.vehicle_id
LEFT JOIN drivers d ON d.id = pt.driver_id
WHERE rp.organization_id = %s AND rp.status = 'confirmed' AND pt.status = 'pending'
  AND NOT EXISTS (SELECT 1 FROM routes r WHERE r.plan_trip_id = pt.id)
  {country}
ORDER BY rp.plan_date DESC, pt.sequence_order
LIMIT 100
"""

PLAN_TRIP_SQL = """
SELECT pt.id, pt.status, pt.delivery_zone, pt.vehicle_id, pt.driver_id, pt.total_weight, pt.total_volume,
       pt.vehicle_capacity_weight,
       rp.organization_id, rp.country_id, rp.plan_date, rp.status AS plan_status,
       COALESCE(d.carrier_id, v.carrier_id) AS carrier_id
FROM plan_trips pt
JOIN route_plans rp ON rp.id = pt.plan_id
LEFT JOIN drivers d ON d.id = pt.driver_id
LEFT JOIN vehicles v ON v.id = pt.vehicle_id
WHERE pt.id = %s
"""

ROUTE_BY_PLAN_TRIP_SQL = "SELECT id FROM routes WHERE plan_trip_id = %s"
ORIGIN_STORE_SQL = """
SELECT id, latitude, longitude FROM stores WHERE organization_id = %s AND country_id = %s AND is_origin = true
ORDER BY code LIMIT 1
"""
ZONE_SQL = "SELECT id FROM zones WHERE organization_id = %s AND (name = %s OR code = %s) LIMIT 1"
PLAN_STOPS_SQL = """
SELECT ps.order_id, COALESCE(o.delivery_latitude, ps.latitude) AS lat, COALESCE(o.delivery_longitude, ps.longitude) AS lng
FROM plan_stops ps LEFT JOIN orders o ON o.id = ps.order_id
WHERE ps.trip_id = %s ORDER BY ps.stop_order
"""

INSERT_ROUTE_SQL = """
INSERT INTO routes (organization_id, store_id, driver_id, vehicle_id, carrier_id, route_number, route_date,
                    actual_start_time, total_stops, completed_stops, total_weight, total_volume, status,
                    notes, route_type_id, plan_trip_id, planned_start_time, planned_end_time, total_distance,
                    capacity_percentage)
VALUES (%s, %s, %s, %s, %s, %s, %s, now(), %s, 0, %s, %s, 'En tránsito', %s, %s, %s, now(), %s, %s, %s)
RETURNING id
"""

INSERT_GUIDE_SQL = """
INSERT INTO dispatch_guides (organization_id, route_id, order_id, guide_number, sequence_number, status,
                             delivery_status, notes, planned_arrival_time)
VALUES (%s, %s, %s, %s, %s, 'Pendiente', 'pending', %s, %s)
"""

INSERT_EVENT_SQL = """
INSERT INTO tracking_events (organization_id, route_id, dispatch_guide_id, event_type, event_status,
                             event_time, latitude, longitude, notes, created_by, distance_m)
VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
"""

ROUTE_ROW_SQL = """
SELECT r.id, r.organization_id, r.status, r.vehicle_id, r.driver_id, s.country_id
FROM routes r JOIN stores s ON s.id = r.store_id WHERE r.id = %s
"""

# Insumos de la ingesta: estado, cierre (para la gracia de 2 h), sede (para detectar la salida) y salida previa.
ROUTES_FOR_POSITIONS_SQL = """
SELECT r.id, r.status, r.vehicle_id, r.driver_id, r.departed_at, r.actual_end_time,
       s.latitude AS origin_lat, s.longitude AS origin_lng
FROM routes r JOIN stores s ON s.id = r.store_id
WHERE r.organization_id = %s AND r.id = ANY(%s::uuid[])
"""

GUIDE_ROW_SQL = """
SELECT g.id, g.route_id, g.organization_id, g.order_id, g.delivery_status, g.notes, r.status AS route_status,
       r.driver_id, s.country_id,
       COALESCE(o.delivery_latitude, ps.latitude) AS stop_lat, COALESCE(o.delivery_longitude, ps.longitude) AS stop_lng
FROM dispatch_guides g
JOIN routes r ON r.id = g.route_id
JOIN stores s ON s.id = r.store_id
LEFT JOIN orders o ON o.id = g.order_id
LEFT JOIN plan_stops ps ON ps.trip_id = r.plan_trip_id AND ps.order_id = g.order_id
WHERE g.id = %s
"""

# App del chofer: el conductor enlazado al usuario, sus viajes en tránsito y sus viajes por iniciar.
DRIVER_BY_USER_SQL = "SELECT id FROM drivers WHERE app_user_id = %s"

MY_ROUTES_SQL = f"""
SELECT {VIAJE_COLUMNS} {VIAJE_JOINS}
WHERE r.organization_id = %s AND r.driver_id = %s AND lower(r.status) = ANY(%s)
ORDER BY sort_at DESC LIMIT 10
"""

MY_PLANNED_SQL = """
SELECT pt.id AS plan_trip_id, rp.plan_date, pt.delivery_zone, v.plate, d.full_name AS driver_name,
       pt.total_weight, pt.sequence_order
FROM plan_trips pt
JOIN route_plans rp ON rp.id = pt.plan_id
LEFT JOIN vehicles v ON v.id = pt.vehicle_id
LEFT JOIN drivers d ON d.id = pt.driver_id
WHERE rp.organization_id = %s AND pt.driver_id = %s AND rp.status = 'confirmed' AND pt.status = 'pending'
  AND rp.plan_date >= %s
  AND NOT EXISTS (SELECT 1 FROM routes r WHERE r.plan_trip_id = pt.id)
ORDER BY rp.plan_date, pt.sequence_order
LIMIT 10
"""

MY_PLANNED_STOPS_SQL = """
SELECT ps.trip_id, ps.stop_order, o.id AS order_id, o.order_number, o.invoice_number, o.total_items, o.total_weight,
       o.delivery_address, o.delivery_city,
       COALESCE(o.delivery_latitude, ps.latitude) AS latitude, COALESCE(o.delivery_longitude, ps.longitude) AS longitude,
       cu.name AS customer_name, cu.phone AS customer_phone
FROM plan_stops ps
JOIN orders o ON o.id = ps.order_id
LEFT JOIN customers cu ON cu.id = o.customer_id
WHERE ps.trip_id = ANY(%s::uuid[])
ORDER BY ps.trip_id, ps.stop_order
"""

INSERT_CONSENT_SQL = """
INSERT INTO tracking_consents (organization_id, app_user_id, version, device_id)
VALUES (%s, %s, %s, %s)
ON CONFLICT (app_user_id, version) DO NOTHING
RETURNING consented_at
"""
CONSENT_SQL = "SELECT consented_at FROM tracking_consents WHERE app_user_id = %s AND version = %s"

UPDATE_GUIDE_SQL = """
UPDATE dispatch_guides
SET delivery_status = %s, status = %s, actual_arrival_time = %s, recipient_name = COALESCE(%s, recipient_name),
    notes = COALESCE(%s, notes), updated_at = now()
WHERE id = %s
"""

COUNT_DONE_SQL = f"""
SELECT count(*) FILTER (WHERE {_GUIDE_STATE} IN {DELIVERED_SQL} OR {_GUIDE_STATE} IN {FAILED_SQL}) AS done,
       count(*) FILTER (WHERE NOT ({_GUIDE_STATE} IN {DELIVERED_SQL} OR {_GUIDE_STATE} IN {FAILED_SQL})) AS pending
FROM dispatch_guides g WHERE g.route_id = %s
"""

SET_COMPLETED_STOPS_SQL = "UPDATE routes SET completed_stops = %s, updated_at = now() WHERE id = %s"
# Cierre automático al cerrar la última parada; idempotente (no pisa un cierre ya registrado).
COMPLETE_ROUTE_SQL = """
UPDATE routes SET status = 'Completada', actual_end_time = %s, completed_stops = %s, updated_at = now()
WHERE id = %s AND actual_end_time IS NULL
"""

INSERT_EVIDENCE_SQL = """
INSERT INTO tracking_evidences (organization_id, route_id, dispatch_guide_id, kind, storage_key, mime_type,
                                size_bytes, captured_at, latitude, longitude, client_id, created_by)
VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
ON CONFLICT (storage_key) DO NOTHING
RETURNING id
"""
SET_GUIDE_PHOTO_SQL = "UPDATE dispatch_guides SET photo_url = %s, updated_at = now() WHERE id = %s"
SET_GUIDE_SIGNATURE_SQL = "UPDATE dispatch_guides SET signature_url = %s, updated_at = now() WHERE id = %s"

# Última posición de VARIOS viajes en una sentencia. `values` = una tupla "(...)" por viaje (LAST_POSITION_ROW).
LAST_POSITION_ROW = "(" + ", ".join(["%s"] * 8) + ")"
UPSERT_LAST_POSITIONS_SQL = """
INSERT INTO tracking_last_positions (route_id, organization_id, latitude, longitude, speed_mps, heading_deg,
                                     battery_pct, recorded_at)
VALUES {values}
ON CONFLICT (route_id) DO UPDATE
SET latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude, speed_mps = EXCLUDED.speed_mps,
    heading_deg = EXCLUDED.heading_deg, battery_pct = EXCLUDED.battery_pct,
    recorded_at = EXCLUDED.recorded_at, updated_at = now()
WHERE tracking_last_positions.recorded_at <= EXCLUDED.recorded_at
"""

POSITION_COLUMNS = ("organization_id, route_id, vehicle_id, driver_id, device_id, client_id, latitude, longitude, "
                    "accuracy_m, speed_mps, heading_deg, battery_pct, is_mock, recorded_at")
POSITION_PLACEHOLDERS = "(" + ", ".join(["%s"] * 14) + ")"
