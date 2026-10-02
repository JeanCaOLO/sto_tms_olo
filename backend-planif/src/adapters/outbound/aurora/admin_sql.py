"""SQL de administración (Aurora, placeholders %s). Portado de
`origin/main:backend/admin` (admin_sql.py + queries de admin_access,
admin_permissions y admin_audit).

app_users guarda el estado como `is_active` (boolean); la API lo expone como
`status` = active | inactive (lo que usa la pantalla de Configuración).
"""

# --- Acceso de administrador -------------------------------------------------
CALLER_ADMIN_SQL = """
SELECT u.id, u.organization_id, COALESCE(u.is_active, true) AS is_active, r.name AS role_name
FROM app_users u LEFT JOIN roles r ON r.id = u.role_id
WHERE u.auth_user_id = %s
"""

# --- Usuarios ----------------------------------------------------------------
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

# --- Roles -------------------------------------------------------------------
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

# --- Matriz de permisos ------------------------------------------------------
CATALOG_SQL = 'SELECT key, group_key AS "group", path FROM app_modules ORDER BY sort_order'
ROLE_SQL = "SELECT id, name, COALESCE(all_countries, true) AS all_countries FROM roles WHERE id = %s"
COUNTRIES_EXIST_SQL = "SELECT id FROM countries WHERE id = ANY(%s::uuid[])"
DELETE_PERMISSIONS_SQL = "DELETE FROM role_permissions WHERE role_id = %s"
INSERT_PERMISSION_SQL = "INSERT INTO role_permissions (role_id, module_key, action) VALUES (%s, %s, %s)"
DELETE_COUNTRIES_SQL = "DELETE FROM role_countries WHERE role_id = %s"
INSERT_COUNTRY_SQL = "INSERT INTO role_countries (role_id, country_id) VALUES (%s, %s)"
UPDATE_ALL_COUNTRIES_SQL = "UPDATE roles SET all_countries = %s WHERE id = %s"

# --- Bitácora ----------------------------------------------------------------
EVENT_SQL = "SELECT * FROM audit.events WHERE id = %s"
MODULE_EXISTS_SQL = "SELECT 1 FROM app_modules WHERE key = %s"
