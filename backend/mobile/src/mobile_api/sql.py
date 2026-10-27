"""SQL de la app del chofer. Placeholders `%s` (pg8000). Las tablas son las del TMS (BD compartida)."""

_GUIDE_STATE = "lower(coalesce(g.delivery_status, g.status, ''))"
DELIVERED_SQL = "('delivered', 'entregado', 'completada')"
FAILED_SQL = "('failed', 'fallido')"

# --- acceso -----------------------------------------------------------------------------------------------

LOGIN_SQL = """
SELECT c.auth_user_id, c.email, c.password_hash FROM auth_credentials c WHERE c.email = %s
"""

# Usuario del token → app_user, rol y conductor enlazado (drivers.app_user_id, migración m01).
DRIVER_CONTEXT_SQL = """
SELECT u.id AS app_user_id, u.auth_user_id, u.organization_id, COALESCE(u.is_active, true) AS is_active,
       u.full_name, r.name AS role_name, d.id AS driver_id, d.full_name AS driver_name
FROM app_users u
LEFT JOIN roles r ON r.id = u.role_id
LEFT JOIN drivers d ON d.app_user_id = u.id
WHERE u.auth_user_id = %s
"""

# Intentos fallidos recientes de un correo (la bitácora de accesos ya los registra; no hace falta otra tabla).
RECENT_LOGIN_FAILURES_SQL = """
SELECT count(*) AS n FROM audit.events
WHERE action = 'login_failed' AND actor_email = %s AND occurred_at > now() - make_interval(secs => %s)
"""

# Lo mismo por IP de origen: una sola IP probando muchos correos no se frena con el límite por correo.
RECENT_LOGIN_FAILURES_BY_IP_SQL = """
SELECT count(*) AS n FROM audit.events
WHERE action = 'login_failed' AND split_part(ip::text, '/', 1) = %s AND occurred_at > now() - make_interval(secs => %s)
"""

INSERT_REFRESH_SQL = """
INSERT INTO mobile_refresh_tokens (app_user_id, token_hash, device_id, expires_at)
VALUES (%s, %s, %s, now() + make_interval(secs => %s))
"""
REFRESH_BY_HASH_SQL = """
SELECT t.id, t.app_user_id, t.expires_at, t.revoked_at, u.auth_user_id, c.email
FROM mobile_refresh_tokens t
JOIN app_users u ON u.id = t.app_user_id
LEFT JOIN auth_credentials c ON c.auth_user_id = u.auth_user_id
WHERE t.token_hash = %s
"""
REVOKE_REFRESH_SQL = "UPDATE mobile_refresh_tokens SET revoked_at = now() WHERE id = %s AND revoked_at IS NULL"
REVOKE_ALL_REFRESH_SQL = "UPDATE mobile_refresh_tokens SET revoked_at = now() WHERE app_user_id = %s AND revoked_at IS NULL"

# --- presencia del chofer (migración m03) --------------------------------------------------------------------------
# `last_seen_at` es la hora del evento en el teléfono (acotada a "ahora"): un evento atrasado de la cola offline no
# pisa uno más nuevo (logout viejo vs. login nuevo).

UPSERT_PRESENCE_SQL = """
INSERT INTO driver_presence (driver_id, organization_id, status, last_event, last_seen_at, device_id, battery_pct)
VALUES (%s, %s, %s, %s, %s, %s, %s)
ON CONFLICT (driver_id) DO UPDATE
SET status = EXCLUDED.status, last_event = EXCLUDED.last_event, last_seen_at = EXCLUDED.last_seen_at,
    device_id = COALESCE(EXCLUDED.device_id, driver_presence.device_id),
    battery_pct = COALESCE(EXCLUDED.battery_pct, driver_presence.battery_pct), updated_at = now()
WHERE driver_presence.last_seen_at <= EXCLUDED.last_seen_at
"""

# Las posiciones solo refrescan la presencia: un chofer que ya hizo logout no vuelve a `online` por un lote tardío.
TOUCH_PRESENCE_SQL = """
INSERT INTO driver_presence (driver_id, organization_id, status, last_event, last_seen_at, device_id, battery_pct)
VALUES (%s, %s, 'online', 'position', %s, %s, %s)
ON CONFLICT (driver_id) DO UPDATE
SET last_event = 'position', last_seen_at = EXCLUDED.last_seen_at,
    device_id = COALESCE(EXCLUDED.device_id, driver_presence.device_id),
    battery_pct = COALESCE(EXCLUDED.battery_pct, driver_presence.battery_pct), updated_at = now()
WHERE driver_presence.status = 'online' AND driver_presence.last_seen_at <= EXCLUDED.last_seen_at
"""

# El logout llega sin token de acceso (solo el refresh token): el conductor se resuelve por su app_user_id.
OFFLINE_BY_USER_SQL = """
INSERT INTO driver_presence (driver_id, organization_id, status, last_event, last_seen_at, device_id)
SELECT d.id, u.organization_id, 'offline', 'logout', %s, %s
FROM drivers d JOIN app_users u ON u.id = d.app_user_id
WHERE d.app_user_id = %s AND u.organization_id IS NOT NULL
ON CONFLICT (driver_id) DO UPDATE
SET status = 'offline', last_event = 'logout', last_seen_at = EXCLUDED.last_seen_at,
    device_id = COALESCE(EXCLUDED.device_id, driver_presence.device_id), updated_at = now()
WHERE driver_presence.last_seen_at <= EXCLUDED.last_seen_at
"""

# --- agenda (mi-viaje) -------------------------------------------------------------------------------------

MY_ROUTES_SQL = """
SELECT r.id, r.route_number, r.route_date, r.status, r.actual_start_time, r.planned_end_time,
       s.latitude AS origin_lat, s.longitude AS origin_lng, co.code AS country, cu.code AS customer_code,
       v.plate, z.name AS zone_name,
       lp.latitude AS last_lat, lp.longitude AS last_lng, lp.recorded_at AS last_position_at
FROM routes r
JOIN stores s ON s.id = r.store_id
LEFT JOIN countries co ON co.id = s.country_id
LEFT JOIN plan_trips pt ON pt.id = r.plan_trip_id
LEFT JOIN route_plans rp ON rp.id = pt.plan_id
LEFT JOIN customers cu ON cu.id = rp.customer_id
LEFT JOIN vehicles v ON v.id = r.vehicle_id
LEFT JOIN zones z ON z.id = r.route_type_id
LEFT JOIN tracking_last_positions lp ON lp.route_id = r.id
WHERE r.organization_id = %s AND r.driver_id = %s AND lower(r.status) = ANY(%s)
ORDER BY COALESCE(r.actual_start_time, r.created_at) DESC, r.id DESC
LIMIT 10
"""

GUIDES_BY_ROUTES_SQL = """
SELECT g.id, g.route_id, g.guide_number, g.sequence_number, g.status, g.delivery_status,
       g.planned_arrival_time, g.actual_arrival_time, g.recipient_name,
       o.order_number, o.invoice_number, o.total_items, o.total_weight, o.delivery_address, o.delivery_city,
       COALESCE(o.delivery_latitude, ps.latitude) AS latitude,
       COALESCE(o.delivery_longitude, ps.longitude) AS longitude,
       cu.name AS customer_name, cu.phone AS customer_phone,
       COALESCE((SELECT array_agg(DISTINCT e.kind) FROM tracking_evidences e WHERE e.dispatch_guide_id = g.id),
                ARRAY[]::text[]) AS evidence_kinds
FROM dispatch_guides g
JOIN routes r ON r.id = g.route_id
JOIN orders o ON o.id = g.order_id
LEFT JOIN customers cu ON cu.id = o.customer_id
LEFT JOIN plan_stops ps ON ps.trip_id = r.plan_trip_id AND ps.order_id = g.order_id
WHERE g.route_id = ANY(%s::uuid[])
ORDER BY g.route_id, g.sequence_number
"""

MY_PLANNED_SQL = """
SELECT pt.id AS plan_trip_id, rp.plan_date, pt.delivery_zone, v.plate, d.full_name AS driver_name
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

# --- posiciones ----------------------------------------------------------------------------------------------

ROUTES_FOR_POSITIONS_SQL = """
SELECT r.id, r.status, r.vehicle_id, r.driver_id, r.departed_at, r.actual_end_time,
       s.latitude AS origin_lat, s.longitude AS origin_lng, co.code AS country, cu.code AS customer_code
FROM routes r LEFT JOIN stores s ON s.id = r.store_id
LEFT JOIN countries co ON co.id = s.country_id
LEFT JOIN plan_trips pt ON pt.id = r.plan_trip_id
LEFT JOIN route_plans rp ON rp.id = pt.plan_id
LEFT JOIN customers cu ON cu.id = rp.customer_id
WHERE r.organization_id = %s AND r.driver_id = %s AND r.id = ANY(%s::uuid[])
"""

SET_DEPARTED_SQL = "UPDATE routes SET departed_at = %s WHERE id = %s AND departed_at IS NULL"

POSITION_COLUMNS = ("organization_id, route_id, vehicle_id, driver_id, device_id, client_id, latitude, longitude, "
                    "accuracy_m, speed_mps, heading_deg, battery_pct, is_mock, recorded_at")
POSITION_PLACEHOLDERS = "(" + ", ".join(["%s"] * 14) + ")"

# Última posición de VARIOS viajes en una sola sentencia; `values` = una tupla LAST_POSITION_ROW por viaje.
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

# --- paradas ----------------------------------------------------------------------------------------------------

GUIDE_ROW_SQL = """
SELECT g.id, g.route_id, g.organization_id, g.order_id, g.delivery_status, g.notes, r.status AS route_status,
       r.driver_id,
       COALESCE(o.delivery_latitude, ps.latitude) AS stop_lat, COALESCE(o.delivery_longitude, ps.longitude) AS stop_lng,
       COALESCE((SELECT array_agg(DISTINCT e.kind) FROM tracking_evidences e WHERE e.dispatch_guide_id = g.id),
                ARRAY[]::text[]) AS evidence_kinds
FROM dispatch_guides g
JOIN routes r ON r.id = g.route_id
LEFT JOIN orders o ON o.id = g.order_id
LEFT JOIN plan_stops ps ON ps.trip_id = r.plan_trip_id AND ps.order_id = g.order_id
WHERE g.id = %s
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

# --- iniciar viaje (el chofer crea la ruta desde su viaje planificado; mismas sentencias que la web) ------------------
PLAN_TRIP_SQL = """
SELECT pt.id, pt.status, pt.delivery_zone, pt.vehicle_id, pt.driver_id, pt.total_weight, pt.total_volume,
       pt.vehicle_capacity_weight,
       rp.organization_id, rp.country_id, rp.plan_date, rp.status AS plan_status,
       COALESCE(d.carrier_id, v.carrier_id) AS carrier_id, co.code AS country, cu.code AS customer_code
FROM plan_trips pt
JOIN route_plans rp ON rp.id = pt.plan_id
LEFT JOIN countries co ON co.id = rp.country_id
LEFT JOIN customers cu ON cu.id = rp.customer_id
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

# Variante con id del teléfono (migración m03): reenviar el mismo evento desde la cola offline no lo duplica.
INSERT_EVENT_ONCE_SQL = """
INSERT INTO tracking_events (organization_id, route_id, dispatch_guide_id, event_type, event_status,
                             event_time, latitude, longitude, notes, created_by, distance_m, client_id)
VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
ON CONFLICT (client_id) WHERE client_id IS NOT NULL DO NOTHING
RETURNING id
"""

INSERT_RETURN_SQL = """
INSERT INTO returns (organization_id, dispatch_guide_id, order_id, return_number, return_type, reason,
                     product_code, product_name, quantity, photo_url, notes)
VALUES (%s, %s, %s, %s, 'devolucion', %s, %s, %s, %s, %s, %s)
ON CONFLICT (organization_id, return_number) DO NOTHING
RETURNING id
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

# --- consentimiento GPS --------------------------------------------------------------------------------------------

INSERT_CONSENT_SQL = """
INSERT INTO tracking_consents (organization_id, app_user_id, version, device_id)
VALUES (%s, %s, %s, %s)
ON CONFLICT (app_user_id, version) DO NOTHING
RETURNING consented_at
"""
CONSENT_SQL = "SELECT consented_at FROM tracking_consents WHERE app_user_id = %s AND version = %s"
