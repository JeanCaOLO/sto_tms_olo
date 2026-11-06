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
SELECT r.id, r.request_number, r.status, r.created_at,
       (SELECT count(*)::int FROM tbl_return_request_items i WHERE i.request_id = r.id) AS items
FROM tbl_return_requests r
WHERE r.organization_id = %s AND r.customer_id = %s AND r.requested_by = %s
ORDER BY r.created_at DESC
LIMIT 50
"""
