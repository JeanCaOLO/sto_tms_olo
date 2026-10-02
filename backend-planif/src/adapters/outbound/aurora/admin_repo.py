"""Adaptador Aurora del port AdminRepo (usuarios, roles, permisos, bitácora).

SQL parametrizado (pg8000). Las escrituras de un usuario (credencial + app_user
+ scopes) y de la matriz de permisos (permisos + países + all_countries) tocan
varias tablas y van en una transacción (`pg.transaction`). Portado de las
queries de `origin/main:backend/admin`.
"""

from __future__ import annotations

from uuid import uuid4

from adapters.outbound.aurora import admin_sql as sql
from domain.admin.auditoria import LIST_COLUMNS
from domain.admin.payload import ScopeInput
from ports.admin_repo import Admin, NewUser
from lib.tms_common import permissions as perms
from lib.tms_common import pg
from lib.tms_common.errors import HttpError


class AuroraAdminRepo:
    """Implementa `ports.AdminRepo` contra las tablas de administración."""

    # --- Acceso de administrador --------------------------------------------
    def _caller(self, auth_user_id: str) -> dict | None:
        rows = pg.query(sql.CALLER_ADMIN_SQL, [auth_user_id])
        return rows[0] if rows else None

    def caller_admin(self, auth_user_id: str) -> Admin | None:
        caller = self._caller(auth_user_id)
        if caller is None or not caller["is_active"] or caller["role_name"] not in perms.ADMIN_ROLES:
            return None
        return Admin(str(caller["id"]), str(caller["organization_id"]))

    def caller_is_admin(self, auth_user_id: str) -> tuple[bool, bool]:
        caller = self._caller(auth_user_id)
        if caller is None:
            return False, False
        is_admin = bool(caller["is_active"]) and caller["role_name"] in perms.ADMIN_ROLES
        return True, is_admin

    # --- Usuarios ------------------------------------------------------------
    def list_users(self, organization_id: str, user_id: str | None = None) -> list[dict]:
        if user_id is None:
            return pg.query(sql.USERS_SQL.format(filter=""), [organization_id])
        return pg.query(sql.USERS_SQL.format(filter="AND u.id = %s"), [organization_id, user_id])

    def owned_user(self, user_id: str, organization_id: str) -> dict | None:
        rows = pg.query(sql.USER_OWNER_SQL, [user_id, organization_id])
        return rows[0] if rows else None

    def role_exists(self, role_id: str) -> bool:
        return bool(pg.query(sql.ROLE_EXISTS_SQL, [role_id]))

    @staticmethod
    def _write_scopes(run: pg.Runner, user_id: str, role_id: str, scopes: list[ScopeInput]) -> None:
        run(sql.DELETE_SCOPES_SQL, [user_id])
        for scope in scopes:
            run(sql.INSERT_SCOPE_SQL, [user_id, role_id, scope.country_id, scope.warehouse_id, scope.customer_id])

    def create_user(self, organization_id: str, user: NewUser) -> str:
        with pg.transaction() as run:
            if run(sql.EMAIL_TAKEN_SQL, [user.email]):
                raise HttpError(409, "Ya existe un usuario con ese correo.")
            auth_user_id = str(uuid4())
            run(sql.INSERT_CREDENTIAL_SQL, [auth_user_id, user.email, user.password_hash])
            rows = run(sql.INSERT_USER_SQL, [auth_user_id, organization_id, user.full_name, user.email,
                                             user.role_id, user.is_active])
            user_id = str(rows[0]["id"])
            self._write_scopes(run, user_id, user.role_id, user.scopes)
        return user_id

    def update_user(self, user_id: str, fields: dict, role_id_for_scopes: str | None,
                    scopes: list[ScopeInput] | None) -> None:
        with pg.transaction() as run:
            if fields:
                # Los nombres de columna salen de la lista blanca del servicio,
                # nunca de texto crudo del cliente.
                assignments = ", ".join(f"{column} = %s" for column in fields)
                run(f"UPDATE app_users SET {assignments}, updated_at = now() WHERE id = %s",
                    [*fields.values(), user_id])
            if scopes is not None:
                self._write_scopes(run, user_id, str(role_id_for_scopes), scopes)
            elif role_id_for_scopes:
                run(sql.SYNC_SCOPE_ROLE_SQL, [role_id_for_scopes, user_id])

    def reset_password(self, auth_user_id: str, password_hash: str) -> None:
        pg.query(sql.UPDATE_PASSWORD_SQL, [password_hash, auth_user_id])

    def delete_user(self, user_id: str, auth_user_id: str) -> None:
        with pg.transaction() as run:
            run(sql.DELETE_SCOPES_SQL, [user_id])
            run(sql.DELETE_USER_SQL, [user_id])
            run(sql.DELETE_CREDENTIAL_SQL, [auth_user_id])

    # --- Roles ---------------------------------------------------------------
    def list_roles(self) -> list[dict]:
        return pg.query(sql.ROLES_SQL)

    def role_name_taken(self, name: str, exclude_role_id: str) -> bool:
        return bool(pg.query(sql.ROLE_NAME_TAKEN_SQL, [name, exclude_role_id]))

    def create_role(self, name: str, description: str) -> dict:
        return pg.query(sql.INSERT_ROLE_SQL, [name, description])[0]

    def update_role(self, role_id: str, name: str, description: str) -> dict | None:
        rows = pg.query(sql.UPDATE_ROLE_SQL, [name, description, role_id])
        return rows[0] if rows else None

    def role_in_use(self, role_id: str) -> bool:
        return bool(pg.query(sql.ROLE_IN_USE_SQL, [role_id, role_id])[0]["uses"])

    def delete_role(self, role_id: str) -> bool:
        return bool(pg.query(sql.DELETE_ROLE_SQL, [role_id]))

    # --- Matriz de permisos --------------------------------------------------
    def role(self, role_id: str) -> dict | None:
        rows = pg.query(sql.ROLE_SQL, [role_id])
        return rows[0] if rows else None

    def module_catalog(self) -> list[dict]:
        return pg.query(sql.CATALOG_SQL)

    def known_module_keys(self) -> set[str]:
        return {row["key"] for row in pg.query(perms.MODULES_SQL)}

    def role_modules(self, role_id: str) -> dict[str, frozenset[str]]:
        return perms.role_modules(role_id)

    def role_country_ids(self, role_id: str) -> list[str]:
        return [str(row["country_id"]) for row in pg.query(perms.ROLE_COUNTRIES_SQL, [role_id])]

    def existing_country_ids(self, ids: list[str]) -> set[str]:
        return {str(row["id"]) for row in pg.query(sql.COUNTRIES_EXIST_SQL, [ids])}

    def put_role_permissions(self, role_id: str, pairs: list[tuple[str, str]],
                             all_countries: bool, country_ids: list[str]) -> None:
        with pg.transaction() as run:
            run(sql.DELETE_PERMISSIONS_SQL, [role_id])
            for key, action in pairs:
                run(sql.INSERT_PERMISSION_SQL, [role_id, key, action])
            run(sql.DELETE_COUNTRIES_SQL, [role_id])
            for country_id in country_ids:
                run(sql.INSERT_COUNTRY_SQL, [role_id, country_id])
            run(sql.UPDATE_ALL_COUNTRIES_SQL, [all_countries, role_id])

    # --- Bitácora ------------------------------------------------------------
    def list_events(self, where: str, args: list, limit: int) -> list[dict]:
        return pg.query(
            f"SELECT {LIST_COLUMNS} FROM audit.events{where} ORDER BY id DESC LIMIT %s", [*args, limit])

    def event(self, event_id: int) -> dict | None:
        rows = pg.query(sql.EVENT_SQL, [event_id])
        return rows[0] if rows else None

    def module_exists(self, module_key: str) -> bool:
        return bool(pg.query(sql.MODULE_EXISTS_SQL, [module_key]))
