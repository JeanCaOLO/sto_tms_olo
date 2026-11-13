"""SQL de las solicitudes de devolución del cliente (sql/64)."""

CUSTOMER_SQL = """
SELECT u.organization_id, u.customer_id, c.organization_id AS customer_organization_id, c.name AS customer_name
FROM tbl_app_users u LEFT JOIN tbl_customers c ON c.id = u.customer_id WHERE u.id = %s
"""

# El catálogo de captura incluye empresas autorizadas aunque aún no tengan solicitudes.
CREATION_COMPANIES_SQL = """
-- creation-companies
SELECT c.id,c.name
FROM tbl_customers c
LEFT JOIN tbl_warehouses w ON w.id = c.warehouse_id AND w.organization_id = c.organization_id
WHERE ({access}) {filters}
ORDER BY c.name,c.id
"""

NEXT_NUMBER_SQL = """
SELECT COALESCE(max(substring(request_number FROM '[0-9]+$')::int), 0) + 1 AS next
FROM tbl_return_requests WHERE organization_id = %s AND left(request_number, 12) = %s
"""

INSERT_REQUEST_SQL = """
INSERT INTO tbl_return_requests (organization_id, customer_id, requested_by, request_number,
                               status, decided_by, decided_at, approval_mode)
VALUES (%s, %s, %s, %s, 'aprobada', %s, now(), 'automatic')
ON CONFLICT (organization_id, request_number) DO NOTHING
RETURNING id, request_number, status, created_at, approval_mode
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
SELECT r.id, r.request_number, r.status, r.created_at, r.decided_by, r.decided_at, r.rejection_reason, r.approval_mode,
       (SELECT count(*)::int FROM tbl_return_request_items i WHERE i.request_id = r.id) AS items
FROM tbl_return_requests r
WHERE r.organization_id = %s AND r.customer_id = %s AND r.requested_by = %s
ORDER BY r.created_at DESC
LIMIT 50
"""

# Serializa numeracion e idempotencia dentro de la transaccion; no crea una secuencia paralela.
CREATE_LOCK_SQL = "SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))"
INSERT_IDEMPOTENT_SQL = """
INSERT INTO tbl_return_requests (id, organization_id, customer_id, requested_by, request_number,
                               status, decided_by, decided_at, approval_mode)
VALUES (%s, %s, %s, %s, %s, 'aprobada', %s, now(), 'automatic')
ON CONFLICT DO NOTHING
RETURNING id, request_number, status, created_at, approval_mode
"""
IDEMPOTENT_SQL = """
SELECT r.* FROM tbl_return_requests r
WHERE r.id = %s AND r.organization_id = %s AND r.customer_id = %s AND r.requested_by = %s
-- idempotent: identidad derivada de organizacion/autor/clave
"""

# Misma semantica jerarquica que context.scopes.covers: empresa, almacen, pais, global explicito.
# Un scope global no sustituye el filtro de organizacion ni los paises del rol.
OPERATOR_SCOPE_SQL = """
r.organization_id = %s AND c.organization_id = r.organization_id
AND (c.warehouse_id IS NULL OR w.id IS NOT NULL)
AND (c.country_id IS NULL OR w.country_id IS NULL OR c.country_id = w.country_id)
AND EXISTS (
 SELECT 1 FROM tbl_user_scopes s WHERE s.app_user_id = %s AND (
  s.customer_id = r.customer_id
  OR (s.customer_id IS NULL AND s.warehouse_id = w.id)
  OR (s.customer_id IS NULL AND s.warehouse_id IS NULL AND s.country_id = COALESCE(c.country_id,w.country_id))
  OR (s.customer_id IS NULL AND s.warehouse_id IS NULL AND s.country_id IS NULL)
 )
)
"""
CLIENT_SCOPE_SQL = "r.organization_id = %s AND c.organization_id = r.organization_id AND r.customer_id = %s AND r.requested_by = %s"
COUNTRY_SCOPE_SQL = " AND COALESCE(c.country_id,w.country_id) = ANY(%s::uuid[])"

REQUEST_FROM_SQL = """
FROM tbl_return_requests r
JOIN tbl_customers c ON c.id = r.customer_id
LEFT JOIN tbl_warehouses w ON w.id = c.warehouse_id AND w.organization_id = r.organization_id
"""
DETAIL_SQL = """
SELECT r.*, c.name AS customer_name, d.full_name AS decided_by_name
{source}
LEFT JOIN tbl_app_users d ON d.id = r.decided_by AND d.organization_id = r.organization_id
WHERE r.id = %s AND ({access})
{lock}
"""
INBOX_SQL = """
SELECT r.id,r.request_number,r.customer_id,c.name AS customer_name,r.requested_by,u.full_name AS requested_by_name,
 r.status,r.created_at,r.decided_by,r.decided_at,r.rejection_reason,r.approval_mode,
 (SELECT count(*)::int FROM tbl_return_request_items i WHERE i.request_id = r.id) AS items
{source}
LEFT JOIN tbl_app_users u ON u.id = r.requested_by AND u.organization_id = r.organization_id
WHERE ({access}) {filters}
ORDER BY r.created_at DESC,r.id DESC LIMIT %s OFFSET %s
"""
ITEMS_SQL = """
SELECT id,line_number,product_code,product_name,quantity,reason_code,description
FROM tbl_return_request_items WHERE request_id = %s ORDER BY line_number
"""
INBOX_COMPANIES_SQL = """
SELECT DISTINCT c.id,c.name
{source}
WHERE ({access}) {filters}
ORDER BY c.name,c.id
"""
FILES_SQL = """
SELECT f.id,f.item_id,f.s3_key,f.kind,f.mime_type,f.size_bytes
FROM tbl_return_request_files f JOIN tbl_return_request_items i ON i.id = f.item_id
WHERE i.request_id = %s ORDER BY f.id
"""
DECIDE_SQL = """
UPDATE tbl_return_requests SET status = %s,decided_by = %s,rejection_reason = %s,decided_at = now()
WHERE id = %s AND organization_id = %s AND status = 'pendiente_asignacion'
RETURNING id,request_number,status,decided_by,decided_at,rejection_reason
"""
