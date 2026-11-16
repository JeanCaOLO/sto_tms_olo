"""SQL del módulo Devoluciones (recepción por viaje + formularios). Un viaje = una ruta (`tbl_routes`)."""

ORGANIZATION_SQL = "SELECT organization_id FROM tbl_app_users WHERE id = %s"

# {scope} = "" o " AND country_id = ANY(%s::uuid[])" (países que el rol ve).
SUMMARY_SQL = """
SELECT count(*)::int AS trips,
       (count(*) FILTER (WHERE open_returns > 0))::int AS trips_pending,
       (count(*) FILTER (WHERE pending_returns = 0))::int AS trips_ready,
       COALESCE(sum(total_returns), 0)::int AS returns_total,
       COALESCE(sum(open_returns), 0)::int AS returns_pending,
       COALESCE(sum(received_returns), 0)::int AS returns_received,
       COALESCE(sum(incident_returns), 0)::int AS returns_incidents
FROM vw_return_trips
WHERE organization_id = %s{filters}{scope}
"""

# Mismo orden descendente de antes (NULLS FIRST), con route_id como desempate único.
# Los indicadores de nulidad permiten comparar también las filas antiguas sin fecha o número.
TRIP_SORT_COLUMNS = ("route_date IS NULL", "COALESCE(route_date, DATE '0001-01-01')",
                     "route_number IS NULL", "COALESCE(route_number, '')", "route_id")
TRIP_SORT_KEY = "(" + ", ".join(TRIP_SORT_COLUMNS) + ")"
TRIPS_SQL = """
SELECT * FROM vw_return_trips
WHERE organization_id = %s{filters}{scope}
ORDER BY """ + ", ".join(f"{column} DESC" for column in TRIP_SORT_COLUMNS) + "\nLIMIT %s\n"

TRIP_SQL = """
SELECT * FROM vw_return_trips
WHERE route_id = %s AND organization_id = %s{scope}
"""

_RETURN_COLUMNS = """
SELECT rt.id, rt.return_number, rt.return_type, rt.return_date, rt.reason, rt.product_code, rt.product_name,
       rt.quantity, rt.photo_url, rt.notes, COALESCE(rt.status, 'pending') AS status,
       rt.received_at, rt.received_by, rt.received_quantity, rt.received_condition,
       g.id AS dispatch_guide_id, g.sequence_number, o.order_number, o.invoice_number,
       i.form_id, f.form_number,
       n.id AS incident_id, n.explanation AS incident_explanation, n.reported_at AS incident_reported_at
FROM tbl_returns rt
JOIN tbl_dispatch_guides g ON g.id = rt.dispatch_guide_id
JOIN tbl_orders o ON o.id = rt.order_id
LEFT JOIN tbl_return_form_items i ON i.return_id = rt.id
LEFT JOIN tbl_return_forms f ON f.id = i.form_id
LEFT JOIN LATERAL (
 SELECT id,explanation,reported_at FROM tbl_return_incidents history
 WHERE history.return_id = rt.id AND history.organization_id = rt.organization_id
 ORDER BY reported_at DESC,id DESC LIMIT 1
) n ON true
"""

# Devoluciones del viaje, con el formulario al que ya pertenecen (form_id NULL = todavía sin formulario).
RETURNS_SQL = _RETURN_COLUMNS + """
WHERE g.route_id = %s AND rt.organization_id = %s
ORDER BY g.sequence_number, rt.return_number
"""

# Devoluciones de UN formulario.
FORM_RETURNS_SQL = _RETURN_COLUMNS + """
WHERE i.form_id = %s AND rt.organization_id = %s
ORDER BY g.sequence_number, rt.return_number
"""

# Cliente y factura de cada parada con devoluciones, tal como los sabe el tracking (borrador de un formulario nuevo).
SECTIONS_SQL = """
SELECT g.id AS dispatch_guide_id, g.sequence_number,
       o.invoice_number AS invoice_number,
       fc.external_code AS customer_code,
       fc.name AS customer_name,
       fc.phone AS phone,
       o.delivery_address AS address,
       r.route_number AS route_label,
       NULL::text AS sellers
FROM tbl_dispatch_guides g
JOIN tbl_routes r ON r.id = g.route_id
JOIN tbl_orders o ON o.id = g.order_id
LEFT JOIN tbl_final_customers fc ON fc.id = o.final_customer_id
WHERE g.route_id = %s AND r.organization_id = %s
  AND EXISTS (SELECT 1 FROM tbl_returns rt WHERE rt.dispatch_guide_id = g.id)
ORDER BY g.sequence_number
"""

# Lo capturado en el formulario manda; lo que falte se prellena con lo que ya sabe el tracking.
FORM_SECTIONS_SQL = """
SELECT g.id AS dispatch_guide_id, g.sequence_number,
       COALESCE(s.invoice_number, o.invoice_number) AS invoice_number,
       COALESCE(s.customer_code, fc.external_code) AS customer_code,
       COALESCE(s.customer_name, fc.name) AS customer_name,
       COALESCE(s.phone, fc.phone) AS phone,
       COALESCE(s.address, o.delivery_address) AS address,
       COALESCE(s.route_label, r.route_number) AS route_label,
       s.sellers
FROM tbl_dispatch_guides g
JOIN tbl_routes r ON r.id = g.route_id
JOIN tbl_orders o ON o.id = g.order_id
LEFT JOIN tbl_final_customers fc ON fc.id = o.final_customer_id
LEFT JOIN tbl_return_form_sections s ON s.form_id = %s AND s.dispatch_guide_id = g.id
WHERE r.organization_id = %s
  AND g.id IN (SELECT rt.dispatch_guide_id FROM tbl_return_form_items i
               JOIN tbl_returns rt ON rt.id = i.return_id WHERE i.form_id = %s)
ORDER BY g.sequence_number
"""

# Formularios del viaje (resumen).
FORMS_SQL = """
SELECT f.id, f.form_number, f.created_at, f.updated_at, count(i.return_id)::int AS returns_count
FROM tbl_return_forms f
LEFT JOIN tbl_return_form_items i ON i.form_id = f.id
WHERE f.route_id = %s AND f.organization_id = %s
GROUP BY f.id
ORDER BY f.created_at, f.form_number
"""

FORM_BY_ID_SQL = "SELECT * FROM tbl_return_forms WHERE id = %s AND organization_id = %s"

# Devoluciones elegidas para un formulario nuevo: del viaje, y con el formulario que ya las tenga (si alguno).
SELECTED_RETURNS_SQL = """
SELECT rt.id, rt.dispatch_guide_id, i.form_id, rt.status
FROM tbl_returns rt
JOIN tbl_dispatch_guides g ON g.id = rt.dispatch_guide_id
LEFT JOIN tbl_return_form_items i ON i.return_id = rt.id
WHERE g.route_id = %s AND rt.organization_id = %s AND rt.id = ANY(%s::uuid[])
"""

FORM_GUIDE_IDS_SQL = """
SELECT DISTINCT rt.dispatch_guide_id AS id
FROM tbl_return_form_items i JOIN tbl_returns rt ON rt.id = i.return_id
WHERE i.form_id = %s
"""

NEXT_FORM_NUMBER_SQL = """
SELECT COALESCE(max(substring(form_number FROM '[0-9]+$')::int), 0) + 1 AS next
FROM tbl_return_forms WHERE organization_id = %s AND left(form_number, 12) = %s
"""

INSERT_FORM_SQL = """
INSERT INTO tbl_return_forms (organization_id, route_id, form_number, physical_receipt_number, branch, return_kind,
                              merchandise_for, observations, transport, guide_number, comments, received_by_name,
                              received_date, created_by)
VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
ON CONFLICT DO NOTHING
RETURNING id, form_number
"""

INSERT_ITEM_SQL = "INSERT INTO tbl_return_form_items (form_id, return_id) VALUES (%s, %s)"

UPDATE_FORM_SQL = """
UPDATE tbl_return_forms
SET physical_receipt_number = %s, branch = %s, return_kind = %s, merchandise_for = %s, observations = %s,
    transport = %s, guide_number = %s, comments = %s, received_by_name = %s, received_date = %s, updated_at = now()
WHERE id = %s AND organization_id = %s
RETURNING id, form_number
"""

UPSERT_SECTION_SQL = """
INSERT INTO tbl_return_form_sections (form_id, dispatch_guide_id, sort_order, invoice_number, customer_code,
                                      customer_name, phone, address, route_label, sellers)
VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
ON CONFLICT (form_id, dispatch_guide_id) DO UPDATE
SET sort_order = EXCLUDED.sort_order, invoice_number = EXCLUDED.invoice_number,
    customer_code = EXCLUDED.customer_code, customer_name = EXCLUDED.customer_name, phone = EXCLUDED.phone,
    address = EXCLUDED.address, route_label = EXCLUDED.route_label, sellers = EXCLUDED.sellers, updated_at = now()
"""

# La devolución solo se puede recibir dentro del país que el rol ve.
RETURN_SQL = """
SELECT rt.id, rt.quantity, rt.received_quantity, rt.received_condition, COALESCE(rt.status, 'pending') AS status, g.route_id
FROM tbl_returns rt
JOIN tbl_dispatch_guides g ON g.id = rt.dispatch_guide_id
JOIN tbl_routes r ON r.id = g.route_id
JOIN tbl_stores s ON s.id = r.store_id
WHERE rt.id = %s AND rt.organization_id = %s{scope}
"""

RECEIVE_SQL = """
UPDATE tbl_returns
SET status = 'received', received_at = now(), received_by = %s, received_quantity = %s, received_condition = %s,
    updated_at = now()
WHERE id = %s AND organization_id = %s AND COALESCE(status, 'pending') IN ('pending', 'approved')
RETURNING id, status, received_at, received_quantity, received_condition
"""

REJECT_SQL = """
UPDATE tbl_returns
SET status = 'rejected', rejection_reason = %s, rejected_by = %s, rejected_at = now(), updated_at = now()
WHERE id = %s AND organization_id = %s AND COALESCE(status, 'pending') IN ('pending', 'approved')
RETURNING id, status, rejection_reason, rejected_at
"""

# received_quantity = lo que vino registrado: recibir todo de un viaje no reinterpreta cantidades.
RECEIVE_ALL_SQL = """
UPDATE tbl_returns rt
SET status = 'received', received_at = now(), received_by = %s, received_quantity = rt.quantity,
    received_condition = %s, updated_at = now()
FROM tbl_dispatch_guides g
WHERE g.id = rt.dispatch_guide_id AND g.route_id = %s AND rt.organization_id = %s
  AND COALESCE(rt.status, 'pending') IN ('pending', 'approved')
RETURNING rt.id
"""
