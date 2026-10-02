"""SQL de administración de usuarios y roles (Aurora). Placeholders %s.

app_users guarda el estado como `is_active` (boolean); la API lo expone como
`status` = active | inactive, que es lo que usa la pantalla de Configuración.
"""

USERS_SQL = """
SELECT u.id, u.full_name, u.email, u.role_id, r.name AS role_name,
       CASE WHEN COALESCE(u.is_active, true) THEN 'active' ELSE 'inactive' END AS status, u.created_at,
       COALESCE((
         SELECT jsonb_agg(jsonb_build_object(
                  'id', s.id, 'country_id', s.country_id, 'country_name', c.name,
                  'warehouse_id', s.warehouse_id, 'warehouse_name', w.name,
                  'customer_id', s.customer_id, 'customer_name', cu.name) ORDER BY s.created_at)
         FROM user_scopes s
         LEFT JOIN countries c ON c.id = s.country_id
         LEFT JOIN warehouses w ON w.id = s.warehouse_id
         LEFT JOIN customers cu ON cu.id = s.customer_id
         WHERE s.app_user_id = u.id), '[]'::jsonb) AS scopes
FROM app_users u
LEFT JOIN roles r ON r.id = u.role_id
WHERE u.organization_id = %s {filter}
ORDER BY u.created_at DESC
"""

USER_OWNER_SQL = "SELECT id, auth_user_id FROM app_users WHERE id = %s AND organization_id = %s"
EMAIL_TAKEN_SQL = "SELECT 1 FROM auth_credentials WHERE email = %s"
ROLE_EXISTS_SQL = "SELECT 1 FROM roles WHERE id = %s"

INSERT_CREDENTIAL_SQL = "INSERT INTO auth_credentials (auth_user_id, email, password_hash) VALUES (%s, %s, %s)"
INSERT_USER_SQL = """
INSERT INTO app_users (auth_user_id, organization_id, full_name, email, role_id, is_active)
VALUES (%s, %s, %s, %s, %s, %s) RETURNING id
"""
INSERT_SCOPE_SQL = """
INSERT INTO user_scopes (app_user_id, role_id, country_id, warehouse_id, customer_id)
VALUES (%s, %s, %s, %s, %s)
"""
DELETE_SCOPES_SQL = "DELETE FROM user_scopes WHERE app_user_id = %s"
SYNC_SCOPE_ROLE_SQL = "UPDATE user_scopes SET role_id = %s WHERE app_user_id = %s"
UPDATE_PASSWORD_SQL = "UPDATE auth_credentials SET password_hash = %s WHERE auth_user_id = %s"
DELETE_USER_SQL = "DELETE FROM app_users WHERE id = %s"
DELETE_CREDENTIAL_SQL = "DELETE FROM auth_credentials WHERE auth_user_id = %s"

ROLES_SQL = """
SELECT r.*, (SELECT count(*)::int FROM app_users u WHERE u.role_id = r.id) AS user_count
FROM roles r ORDER BY r.name
"""
ROLE_NAME_TAKEN_SQL = "SELECT 1 FROM roles WHERE lower(name) = lower(%s) AND id::text <> %s"
INSERT_ROLE_SQL = "INSERT INTO roles (name, description) VALUES (%s, %s) RETURNING *"
UPDATE_ROLE_SQL = "UPDATE roles SET name = %s, description = %s WHERE id = %s RETURNING *"
ROLE_IN_USE_SQL = """
SELECT (SELECT count(*) FROM app_users WHERE role_id = %s)
     + (SELECT count(*) FROM user_scopes WHERE role_id = %s) AS uses
"""
DELETE_ROLE_SQL = "DELETE FROM roles WHERE id = %s RETURNING id"
