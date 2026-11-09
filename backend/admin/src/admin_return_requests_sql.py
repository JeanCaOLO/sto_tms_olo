"""SQL de las solicitudes de devolución del cliente (sql/64)."""

CUSTOMER_SQL = "SELECT organization_id, customer_id FROM tbl_app_users WHERE id = %s"

NEXT_NUMBER_SQL = """
SELECT COALESCE(max(substring(request_number FROM '[0-9]+$')::int), 0) + 1 AS next
FROM tbl_return_requests WHERE organization_id = %s AND left(request_number, 12) = %s
"""

INSERT_REQUEST_SQL = """
INSERT INTO tbl_return_requests (organization_id, customer_id, requested_by, request_number)
VALUES (%s, %s, %s, %s)
ON CONFLICT (organization_id, request_number) DO NOTHING
RETURNING id, request_number, status, created_at
"""

INSERT_ITEM_SQL = """
INSERT INTO tbl_return_request_items (request_id, line_number, product_code, product_name, quantity, reason_code,
                                      description)
VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id
"""

INSERT_FILE_SQL = """
INSERT INTO tbl_return_request_files (item_id, s3_key, kind, mime_type, size_bytes)
VALUES (%s, %s, %s, %s, %s)
"""

MINE_SQL = """
SELECT r.id, r.request_number, r.status, r.created_at
FROM tbl_return_requests r
WHERE r.organization_id = %s AND r.customer_id = %s AND r.requested_by = %s
ORDER BY r.created_at DESC
LIMIT 50
"""

# Vista interna (rol Devoluciones): las solicitudes de TODOS los clientes de la organización.
ALL_SQL = """
SELECT r.id, r.request_number, r.status, r.created_at, r.customer_id, cu.name AS customer_name,
       u.full_name AS requested_by_name
FROM tbl_return_requests r
LEFT JOIN tbl_customers cu ON cu.id = r.customer_id
LEFT JOIN tbl_app_users u ON u.id = r.requested_by
WHERE r.organization_id = %s
ORDER BY r.created_at DESC
LIMIT 100
"""

ITEMS_SQL = """
SELECT i.id, i.request_id, i.line_number, i.product_code, i.product_name, i.quantity, i.reason_code, i.description
FROM tbl_return_request_items i
WHERE i.request_id = ANY(%s::uuid[])
ORDER BY i.request_id, i.line_number
"""

FILES_SQL = """
SELECT f.item_id, f.s3_key, f.kind, f.mime_type, f.size_bytes
FROM tbl_return_request_files f
WHERE f.item_id = ANY(%s::uuid[])
ORDER BY f.created_at, f.id
"""
