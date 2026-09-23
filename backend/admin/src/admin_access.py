"""Solo un administrador puede gestionar usuarios y roles."""

from dataclasses import dataclass

from tms_common import pg
from tms_common.errors import HttpError
from tms_common.event import auth_user

ADMIN_ROLES = frozenset({"SuperAdministrador", "SuperUsuario", "Administrador", "Admin"})

CALLER_SQL = """
SELECT u.id, u.organization_id, COALESCE(u.is_active, true) AS is_active, r.name AS role_name
FROM app_users u LEFT JOIN roles r ON r.id = u.role_id
WHERE u.auth_user_id = %s
"""


@dataclass(frozen=True)
class Admin:
    app_user_id: str
    organization_id: str


def require_admin(event: dict) -> Admin:
    rows = pg.query(CALLER_SQL, [auth_user(event)["id"]])
    if not rows:
        raise HttpError(401, "No existe app_user para este usuario autenticado.")
    caller = rows[0]
    if not caller["is_active"] or caller["role_name"] not in ADMIN_ROLES:
        raise HttpError(403, "Solo un administrador puede gestionar usuarios y roles.")
    return Admin(str(caller["id"]), str(caller["organization_id"]))
