"""SQL en bloque de la ingesta de puntos de entrega (ver ingest_delivery_points.py).

stage_points es una tabla temporal con el CSV ya limpio; todo lo demás se
cruza contra ella en pocas sentencias. Placeholders %s.
"""

STAGE_COLUMNS = ("code", "name", "wms_zone_code", "route_code", "zone_code",
                 "latitude", "longitude", "geocoding_status")

CUSTOMER_SQL = "SELECT id, country_id FROM customers WHERE code = %s"

CREATE_STAGE_SQL = """
CREATE TEMP TABLE stage_points (
  code text PRIMARY KEY, name text NOT NULL, wms_zone_code text, route_code text, zone_code text,
  latitude numeric, longitude numeric, geocoding_status text NOT NULL
) ON COMMIT DROP
"""

# Clientes finales nuevos; los que ya existen conservan su nombre.
INSERT_FINAL_CUSTOMERS_SQL = """
INSERT INTO final_customers (customer_id, external_code, name, status)
SELECT %s, s.code, s.name, 'active' FROM stage_points s
ON CONFLICT (customer_id, external_code) DO NOTHING
RETURNING id
"""

_POINT_OF_ROW = """
FROM stage_points s
JOIN final_customers fc ON fc.customer_id = %s AND fc.external_code = s.code
JOIN delivery_points dp ON dp.final_customer_id = fc.id AND dp.external_code = s.code
"""

UPDATE_ADDRESSES_SQL = """
UPDATE addresses a
SET latitude = s.latitude, longitude = s.longitude, geocoding_status = s.geocoding_status,
    geocoding_provider = 'wms-csv',
    geocoded_at = CASE WHEN s.geocoding_status = 'OK' THEN now() END, updated_at = now()
""" + _POINT_OF_ROW + """
WHERE a.id = dp.address_id
RETURNING a.id
"""

UPDATE_POINTS_SQL = """
UPDATE delivery_points p
SET name = s.name, route_code = s.route_code, wms_zone_code = s.wms_zone_code, active = true,
    zone_id = (SELECT z.id FROM zones z WHERE z.country_id = %s AND z.code = s.zone_code),
    updated_at = now()
""" + _POINT_OF_ROW + """
WHERE p.id = dp.id
RETURNING p.id
"""

# Puntos nuevos: una dirección por punto. El CTE `missing` se referencia dos
# veces, así que PostgreSQL lo materializa una vez y el uuid de la dirección es
# el mismo en ambos INSERT.
INSERT_POINTS_SQL = """
WITH missing AS (
  SELECT s.*, fc.id AS final_customer_id, gen_random_uuid() AS address_id,
         NOT EXISTS (SELECT 1 FROM delivery_points d WHERE d.final_customer_id = fc.id AND d.is_default) AS is_default
  FROM stage_points s
  JOIN final_customers fc ON fc.customer_id = %s AND fc.external_code = s.code
  WHERE NOT EXISTS (SELECT 1 FROM delivery_points d WHERE d.final_customer_id = fc.id AND d.external_code = s.code)
), new_addresses AS (
  INSERT INTO addresses (id, country_id, latitude, longitude, geocoding_status, geocoding_provider, geocoded_at)
  SELECT address_id, %s, latitude, longitude, geocoding_status, 'wms-csv',
         CASE WHEN geocoding_status = 'OK' THEN now() END
  FROM missing
  RETURNING id
)
INSERT INTO delivery_points (final_customer_id, address_id, external_code, name, is_default, active,
                             zone_id, route_code, wms_zone_code)
SELECT m.final_customer_id, m.address_id, m.code, m.name, m.is_default, true,
       (SELECT z.id FROM zones z WHERE z.country_id = %s AND z.code = m.zone_code), m.route_code, m.wms_zone_code
FROM missing m
RETURNING id
"""

REPORT_SQL = """
SELECT 'geocodificación ' || geocoding_status AS label, count(*) AS total FROM stage_points GROUP BY geocoding_status
UNION ALL
SELECT CASE WHEN z.id IS NULL THEN 'sin zona en catálogo' ELSE 'con zona' END, count(*)
FROM stage_points s LEFT JOIN zones z ON z.country_id = %s AND z.code = s.zone_code
GROUP BY z.id IS NULL
"""
