"""Permisos efectivos del usuario: matriz del rol (módulo × acción) y países visibles.

La matriz vive en role_permissions / role_countries (sql/15). Un rol
administrador tiene todo por código, sin filas. Fail-closed: un usuario sin
rol o con un rol sin filas no puede nada.
"""

from dataclasses import dataclass

from . import pg
from .errors import HttpError
from .event import auth_user

ADMIN_ROLES = frozenset({"SuperAdministrador", "SuperUsuario", "Administrador", "Admin"})
ACTIONS = ("view", "create", "edit", "delete", "export")

CALLER_SQL = """
SELECT u.id, COALESCE(u.is_active, true) AS is_active, r.id AS role_id, r.name AS role_name,
       COALESCE(r.all_countries, true) AS all_countries
FROM app_users u LEFT JOIN roles r ON r.id = u.role_id
WHERE u.auth_user_id = %s
"""
MODULES_SQL = "SELECT key FROM app_modules ORDER BY sort_order"
ROLE_PERMISSIONS_SQL = "SELECT module_key, action FROM role_permissions WHERE role_id = %s"
ROLE_COUNTRIES_SQL = "SELECT country_id FROM role_countries WHERE role_id = %s"


@dataclass(frozen=True)
class Permissions:
    app_user_id: str
    role_id: str | None
    role_name: str | None
    is_admin: bool
    modules: dict[str, frozenset[str]]
    all_countries: bool
    country_ids: tuple[str, ...]

    def can(self, module: str, action: str) -> bool:
        return self.is_admin or action in self.modules.get(module, frozenset())

    def require(self, module: str | None, action: str) -> None:
        if self.is_admin:
            return
        if module is None or not self.can(module, action):
            raise HttpError(403, f'Tu rol no tiene permiso para "{action}" en "{module or "este recurso"}".')

    @property
    def country_filter(self) -> tuple[str, ...] | None:
        """None = ve todos los países; tupla (posiblemente vacía) = solo esos."""
        return None if self.is_admin or self.all_countries else self.country_ids

    def to_json(self) -> dict:
        return {
            "role": {"id": self.role_id, "name": self.role_name},
            "is_admin": self.is_admin,
            "modules": {key: [a for a in ACTIONS if a in actions] for key, actions in self.modules.items()},
            "countries": {"all": self.country_filter is None, "ids": list(self.country_ids)},
        }


def _admin_modules() -> dict[str, frozenset[str]]:
    return {row["key"]: frozenset(ACTIONS) for row in pg.query(MODULES_SQL)}


def role_modules(role_id: str) -> dict[str, frozenset[str]]:
    grouped: dict[str, set[str]] = {}
    for row in pg.query(ROLE_PERMISSIONS_SQL, [role_id]):
        grouped.setdefault(row["module_key"], set()).add(row["action"])
    return {key: frozenset(actions) for key, actions in grouped.items()}


def for_user(auth_user_id: str) -> Permissions:
    rows = pg.query(CALLER_SQL, [auth_user_id])
    if not rows:
        raise HttpError(401, "No existe app_user para este usuario autenticado.")
    caller = rows[0]
    if not caller["is_active"]:
        raise HttpError(403, "Tu usuario está inactivo.")
    role_id = None if caller["role_id"] is None else str(caller["role_id"])
    is_admin = caller["role_name"] in ADMIN_ROLES
    if is_admin:
        modules, all_countries, countries = _admin_modules(), True, ()
    elif role_id is None:
        modules, all_countries, countries = {}, False, ()
    else:
        modules, all_countries = role_modules(role_id), bool(caller["all_countries"])
        countries = () if all_countries else tuple(
            str(row["country_id"]) for row in pg.query(ROLE_COUNTRIES_SQL, [role_id]))
    return Permissions(str(caller["id"]), role_id, caller["role_name"], is_admin, modules, all_countries, countries)


def for_event(event: dict) -> Permissions:
    return for_user(auth_user(event)["id"])
