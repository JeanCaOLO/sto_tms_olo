"""SQL del tracking en vivo. Placeholders `%s` (pg8000)."""

ORG_SQL = "SELECT organization_id FROM app_users WHERE id = %s"

# Entrega (delivered/failed) según delivery_status y, de respaldo, status (datos de scripts viejos).
_GUIDE_STATE = "lower(coalesce(g.delivery_status, g.status, ''))"
DELIVERED_SQL = "('delivered', 'entregado', 'completada')"
FAILED_SQL = "('failed', 'fallido')"

VIAJE_COLUMNS = """
  r.id, r.route_number, r.route_date, r.status, r.actual_start_time, r.actual_end_time,
  r.planned_start_time, r.planned_end_time, r.total_distance, r.capacity_percentage, r.created_at, r.plan_trip_id,
  s.country_id, s.latitude AS origin_lat, s.longitude AS origin_lng,
  d.full_name AS driver_name, v.plate, c.name AS carrier_name, z.name AS zone_name,
  lp.latitude AS last_lat, lp.longitude AS last_lng, lp.speed_mps, lp.heading_deg,
  lp.battery_pct, lp.recorded_at AS last_position_at,
  COALESCE(r.actual_start_time, r.created_at) AS sort_at
"""

VIAJE_JOINS = """
FROM routes r
JOIN stores s ON s.id = r.store_id
LEFT JOIN drivers d ON d.id = r.driver_id
LEFT JOIN vehicles v ON v.id = r.vehicle_id
LEFT JOIN carriers c ON c.id = r.carrier_id
LEFT JOIN zones z ON z.id = r.route_type_id
LEFT JOIN tracking_last_positions lp ON lp.route_id = r.id
"""

# Progreso por ruta, calculado de las guías (no del contador denormalizado completed_stops).
PROGRESS_SQL = f"""
SELECT g.route_id,
       count(*) AS total,
       count(*) FILTER (WHERE {_GUIDE_STATE} IN {DELIVERED_SQL}) AS delivered,
       count(*) FILTER (WHERE {_GUIDE_STATE} IN {FAILED_SQL}) AS failed,
       min(g.planned_arrival_time) FILTER (
         WHERE NOT ({_GUIDE_STATE} IN {DELIVERED_SQL} OR {_GUIDE_STATE} IN {FAILED_SQL})) AS next_planned
FROM dispatch_guides g
WHERE g.route_id = ANY(%s::uuid[])
GROUP BY g.route_id
"""

# Novedades y recolectas por ruta (eventos de tracking).
EVENT_COUNTS_SQL = """
SELECT route_id,
       count(*) FILTER (WHERE event_type = 'incident') AS incidents,
       count(*) FILTER (WHERE event_type = 'pickup') AS pickups
FROM tracking_events
WHERE route_id = ANY(%s::uuid[])
GROUP BY route_id
"""

RETURN_COUNTS_SQL = """
SELECT g.route_id, count(*) AS returns
FROM returns r JOIN dispatch_guides g ON g.id = r.dispatch_guide_id
WHERE g.route_id = ANY(%s::uuid[])
GROUP BY g.route_id
"""

# Métricas del semáforo: fallidas, entregas sin factura firmada + firma y mayor retraso de llegada.
REVIEW_METRICS_SQL = f"""
SELECT g.route_id,
       count(*) FILTER (WHERE {_GUIDE_STATE} IN {FAILED_SQL}) AS failed,
       count(*) FILTER (
         WHERE {_GUIDE_STATE} IN {DELIVERED_SQL}
           AND NOT (EXISTS (SELECT 1 FROM tracking_evidences e WHERE e.dispatch_guide_id = g.id AND e.kind = 'photo_invoice')
                AND EXISTS (SELECT 1 FROM tracking_evidences e WHERE e.dispatch_guide_id = g.id AND e.kind = 'signature'))
       ) AS missing_evidence,
       max(extract(epoch FROM (g.actual_arrival_time - g.planned_arrival_time)) / 60) AS max_delay_min
FROM dispatch_guides g
WHERE g.route_id = ANY(%s::uuid[])
GROUP BY g.route_id
"""

REVIEWS_SQL = """
SELECT t.route_id, t.reviewed_at, t.note, u.full_name AS reviewed_by_name
FROM tracking_reviews t LEFT JOIN app_users u ON u.id = t.reviewed_by
WHERE t.route_id = ANY(%s::uuid[])
"""

UPSERT_REVIEW_SQL = """
INSERT INTO tracking_reviews (route_id, organization_id, reviewed_by, note)
VALUES (%s, %s, %s, %s)
ON CONFLICT (route_id) DO UPDATE SET reviewed_by = EXCLUDED.reviewed_by, reviewed_at = now(), note = EXCLUDED.note
"""

FIRST_POSITIONS_SQL = """
SELECT latitude, longitude, recorded_at FROM tracking_positions
WHERE route_id = %s ORDER BY recorded_at LIMIT 200
"""

ROUTE_ONE_SQL = f"SELECT {VIAJE_COLUMNS} {VIAJE_JOINS} WHERE r.id = %s"

GUIDES_SQL = """
SELECT g.id, g.guide_number, g.sequence_number, g.status, g.delivery_status,
       g.actual_arrival_time, g.planned_arrival_time, g.recipient_name, g.notes,
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

EVENTS_SQL = """
SELECT id, dispatch_guide_id, event_type, event_status, event_time, notes
FROM tracking_events WHERE route_id = %s ORDER BY event_time DESC LIMIT 200
"""

EVIDENCES_SQL = """
SELECT id, dispatch_guide_id, kind, storage_key, mime_type, captured_at
FROM tracking_evidences WHERE route_id = %s ORDER BY created_at
"""

RETURNS_SQL = """
SELECT id, dispatch_guide_id, return_number, return_type, reason, product_name, quantity, status, notes
FROM returns WHERE dispatch_guide_id = ANY(%s::uuid[]) ORDER BY return_date
"""

TRAIL_SQL = """
SELECT latitude, longitude, recorded_at FROM tracking_positions
WHERE route_id = %s ORDER BY recorded_at DESC LIMIT 100
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

ROUTES_FOR_POSITIONS_SQL = """
SELECT id, status, vehicle_id, driver_id FROM routes
WHERE organization_id = %s AND id = ANY(%s::uuid[])
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

INSERT_RETURN_SQL = """
INSERT INTO returns (organization_id, dispatch_guide_id, order_id, return_number, return_type, reason,
                     product_code, product_name, quantity, photo_url, notes)
VALUES (%s, %s, %s, %s, 'devolucion', %s, %s, %s, %s, %s, %s)
ON CONFLICT (organization_id, return_number) DO NOTHING
RETURNING id
"""

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
COMPLETE_ROUTE_SQL = """
UPDATE routes SET status = 'Completada', actual_end_time = now(), completed_stops = %s, updated_at = now()
WHERE id = %s
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

UPSERT_LAST_POSITION_SQL = """
INSERT INTO tracking_last_positions (route_id, organization_id, latitude, longitude, speed_mps, heading_deg,
                                     battery_pct, recorded_at)
VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
ON CONFLICT (route_id) DO UPDATE
SET latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude, speed_mps = EXCLUDED.speed_mps,
    heading_deg = EXCLUDED.heading_deg, battery_pct = EXCLUDED.battery_pct,
    recorded_at = EXCLUDED.recorded_at, updated_at = now()
WHERE tracking_last_positions.recorded_at <= EXCLUDED.recorded_at
"""

POSITION_COLUMNS = ("organization_id, route_id, vehicle_id, driver_id, device_id, client_id, latitude, longitude, "
                    "accuracy_m, speed_mps, heading_deg, battery_pct, is_mock, recorded_at")
POSITION_PLACEHOLDERS = "(" + ", ".join(["%s"] * 14) + ")"

PENDING_REVIEW_COUNT_SQL = """
SELECT count(*) AS n
FROM routes r JOIN stores s ON s.id = r.store_id
WHERE r.organization_id = %s AND lower(r.status) = ANY(%s)
  AND NOT EXISTS (SELECT 1 FROM tracking_reviews tr WHERE tr.route_id = r.id)
  {country}
"""
