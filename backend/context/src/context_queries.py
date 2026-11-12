"""SQL de la jerarquía operativa (Aurora). Placeholders %s."""

COUNTRIES_SQL = """
SELECT id, code, name, timezone, locale, unit_system, date_format
FROM tbl_countries WHERE true {scope_clause} ORDER BY name
"""

WAREHOUSES_SQL = """
SELECT id, country_id, code, name, timezone, active
FROM tbl_warehouses WHERE country_id = %s AND active = true ORDER BY name
"""

CUSTOMERS_SQL = """
SELECT id, warehouse_id, code, name, status
FROM tbl_customers WHERE warehouse_id = %s ORDER BY name
"""

FINAL_CUSTOMERS_SQL = """
SELECT id, customer_id, external_code, name, region, status
FROM tbl_final_customers WHERE customer_id = %s ORDER BY name
"""

FINAL_CUSTOMER_OWNER_SQL = "SELECT customer_id FROM tbl_final_customers WHERE id = %s"

DELIVERY_POINTS_SQL = """
SELECT dp.id, dp.final_customer_id, dp.external_code, dp.name, dp.delivery_instructions,
       dp.delivery_window_start, dp.delivery_window_end, dp.is_default, dp.active,
       a.line1, a.line2, a.city, a.state, a.latitude, a.longitude
FROM tbl_delivery_points dp
LEFT JOIN tbl_addresses a ON a.id = dp.address_id
WHERE dp.final_customer_id = %s AND dp.active = true
ORDER BY dp.is_default DESC, dp.name
"""
