"""CRUD de usuarios: credencial (auth_credentials) + app_users + user_scopes,
siempre en una sola transacción para no dejar registros huérfanos."""

from dataclasses import dataclass
from uuid import uuid4

from tms_common import pg
from tms_common.errors import HttpError
from tms_common.event import json_body, path_param
from tms_common.passwords import hash_password
from tms_common.responses import json_response

import admin_payload as payload
import admin_sql as sql
from admin_access import Admin, require_admin


@dataclass(frozen=True)
class NewUser:
    full_name: str
    email: str
    password: str
    role_id: str
    status: str
    scopes: list[payload.ScopeInput]


def _ok(data: object) -> dict:
    return json_response(200, {"data": data, "error": None})


def _body(event: dict) -> dict:
    body = json_body(event)
    return body if isinstance(body, dict) else {}


def _owned_user(admin: Admin, user_id: str) -> dict:
    rows = pg.query(sql.USER_OWNER_SQL, [user_id, admin.organization_id])
    if not rows:
        raise HttpError(404, "Usuario no encontrado")
    return rows[0]


def _role_id(run: pg.Runner, body: dict) -> str:
    role_id = payload.required_text(body, "role_id", "El rol")
    if not run(sql.ROLE_EXISTS_SQL, [role_id]):
        raise HttpError(400, "El rol no existe")
    return role_id


def _write_scopes(run: pg.Runner, user_id: str, role_id: str, scopes: list[payload.ScopeInput]) -> None:
    run(sql.DELETE_SCOPES_SQL, [user_id])
    for scope in scopes:
        run(sql.INSERT_SCOPE_SQL, [user_id, role_id, scope.country_id, scope.warehouse_id, scope.customer_id])


def insert_user(run: pg.Runner, organization_id: str, user: NewUser) -> str:
    """Crea credencial + app_user + scopes. Reutilizado por el bootstrap del primer admin."""
    if run(sql.EMAIL_TAKEN_SQL, [user.email]):
        raise HttpError(409, "Ya existe un usuario con ese correo.")
    auth_user_id = str(uuid4())
    run(sql.INSERT_CREDENTIAL_SQL, [auth_user_id, user.email, hash_password(user.password)])
    rows = run(sql.INSERT_USER_SQL, [auth_user_id, organization_id, user.full_name, user.email,
                                     user.role_id, user.status == "active"])
    user_id = str(rows[0]["id"])
    _write_scopes(run, user_id, user.role_id, user.scopes)
    return user_id


def _fetch(admin: Admin, user_id: str | None = None) -> list[dict]:
    if user_id is None:
        return pg.query(sql.USERS_SQL.format(filter=""), [admin.organization_id])
    return pg.query(sql.USERS_SQL.format(filter="AND u.id = %s"), [admin.organization_id, user_id])


def list_users(event: dict) -> dict:
    return _ok(_fetch(require_admin(event)))


def create_user(event: dict) -> dict:
    admin, body = require_admin(event), _body(event)
    with pg.transaction() as run:
        user = NewUser(payload.required_text(body, "full_name", "El nombre"), payload.email(body),
                       payload.password(body), _role_id(run, body), payload.status(body), payload.scopes(body))
        user_id = insert_user(run, admin.organization_id, user)
    return _ok(_fetch(admin, user_id)[0])


def _update_fields(run: pg.Runner, user_id: str, body: dict) -> str | None:
    fields: dict[str, object] = {}
    if "full_name" in body:
        fields["full_name"] = payload.required_text(body, "full_name", "El nombre")
    if "status" in body:
        fields["is_active"] = payload.status(body) == "active"
    if "role_id" in body:
        fields["role_id"] = _role_id(run, body)
    if fields:
        assignments = ", ".join(f"{column} = %s" for column in fields)
        run(f"UPDATE app_users SET {assignments}, updated_at = now() WHERE id = %s", [*fields.values(), user_id])
    return fields.get("role_id")  # type: ignore[return-value]


def update_user(event: dict) -> dict:
    admin, body = require_admin(event), _body(event)
    user_id = str(_owned_user(admin, path_param(event, "id"))["id"])
    if user_id == admin.app_user_id and body.get("status") == "inactive":
        raise HttpError(400, "No puedes desactivar tu propio usuario.")
    with pg.transaction() as run:
        role_id = _update_fields(run, user_id, body)
        if "scopes" in body:
            current_role = role_id or _fetch(admin, user_id)[0]["role_id"]
            _write_scopes(run, user_id, str(current_role), payload.scopes(body))
        elif role_id:
            run(sql.SYNC_SCOPE_ROLE_SQL, [role_id, user_id])
    return _ok(_fetch(admin, user_id)[0])


def reset_password(event: dict) -> dict:
    admin = require_admin(event)
    user = _owned_user(admin, path_param(event, "id"))
    pg.query(sql.UPDATE_PASSWORD_SQL, [hash_password(payload.password(_body(event))), user["auth_user_id"]])
    return _ok({"id": str(user["id"])})


def delete_user(event: dict) -> dict:
    admin = require_admin(event)
    user = _owned_user(admin, path_param(event, "id"))
    if str(user["id"]) == admin.app_user_id:
        raise HttpError(400, "No puedes eliminar tu propio usuario.")
    with pg.transaction() as run:
        run(sql.DELETE_SCOPES_SQL, [user["id"]])
        run(sql.DELETE_USER_SQL, [user["id"]])
        run(sql.DELETE_CREDENTIAL_SQL, [user["auth_user_id"]])
    return _ok({"id": str(user["id"])})
