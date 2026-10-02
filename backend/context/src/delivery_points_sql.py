"""SQL de puntos de entrega (Aurora). Placeholders %s."""

POINT_SQL = """
SELECT dp.id, dp.external_code, dp.name, dp.route_code, dp.wms_zone_code, dp.zone_id, dp.is_default, dp.active,
       dp.delivery_instructions, fc.id AS final_customer_id, fc.customer_id,
       a.id AS address_id, a.country_id, a.line1, a.line2, a.city, a.state, a.latitude, a.longitude, a.geocoding_status
FROM delivery_points dp
JOIN final_customers fc ON fc.id = dp.final_customer_id
LEFT JOIN addresses a ON a.id = dp.address_id
WHERE dp.id = %s
"""

CUSTOMER_COUNTRY_SQL = "SELECT country_id FROM customers WHERE id = %s"
FIND_FINAL_CUSTOMER_SQL = "SELECT id FROM final_customers WHERE customer_id = %s AND external_code = %s"
INSERT_FINAL_CUSTOMER_SQL = """
INSERT INTO final_customers (customer_id, external_code, name, status) VALUES (%s, %s, %s, 'active') RETURNING id
"""
POINT_EXISTS_SQL = "SELECT 1 FROM delivery_points WHERE final_customer_id = %s AND external_code = %s"

INSERT_ADDRESS_SQL = """
INSERT INTO addresses (country_id, line1, line2, city, state, latitude, longitude, geocoding_status,
                       geocoding_provider, geocoded_at)
VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'manual', CASE WHEN %s = 'OK' THEN now() END)
RETURNING id
"""
INSERT_POINT_SQL = """
INSERT INTO delivery_points (final_customer_id, address_id, external_code, name, delivery_instructions,
                             zone_id, route_code, is_default, active)
SELECT %s, %s, %s, %s, %s, %s, %s,
       NOT EXISTS (SELECT 1 FROM delivery_points WHERE final_customer_id = %s AND is_default), true
RETURNING id
"""

UPDATE_ADDRESS_SQL = """
UPDATE addresses SET line1 = %s, line2 = %s, city = %s, state = %s, latitude = %s, longitude = %s,
       geocoding_status = %s, geocoding_provider = 'manual',
       geocoded_at = CASE WHEN %s = 'OK' THEN now() END, updated_at = now()
WHERE id = %s
"""

DELETE_POINT_SQL = "DELETE FROM delivery_points WHERE id = %s"
DELETE_ADDRESS_SQL = "DELETE FROM addresses WHERE id = %s"
