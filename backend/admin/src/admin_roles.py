"""CRUD de roles. Un rol asignado a usuarios o scopes no se puede borrar."""

from tms_common import pg
from tms_common.errors import HttpError
from tms_common.event import json_body, path_param
from tms_common.responses import json_response

import admin_payload as payload
import admin_sql as sql
from admin_access import require_admin

NO_ID = ""


def _ok(data: object) -> dict:
    return json_response(200, {"data": data, "error": None})


def _fields(event: dict, role_id: str = NO_ID) -> tuple[str, str]:
    body = json_body(event)
    body = body if isinstance(body, dict) else {}
    name = payload.required_text(body, "name", "El nombre del rol")
    if pg.query(sql.ROLE_NAME_TAKEN_SQL, [name, role_id]):
        raise HttpError(409, f'Ya existe un rol llamado "{name}".')
    return name, str(body.get("description") or "").strip()


def list_roles(event: dict) -> dict:
    require_admin(event)
    return _ok(pg.query(sql.ROLES_SQL))


def create_role(event: dict) -> dict:
    require_admin(event)
    return _ok(pg.query(sql.INSERT_ROLE_SQL, list(_fields(event)))[0])


def update_role(event: dict) -> dict:
    require_admin(event)
    role_id = path_param(event, "id")
    rows = pg.query(sql.UPDATE_ROLE_SQL, [*_fields(event, role_id), role_id])
    if not rows:
        raise HttpError(404, "Rol no encontrado")
    return _ok(rows[0])


def delete_role(event: dict) -> dict:
    require_admin(event)
    role_id = path_param(event, "id")
    if pg.query(sql.ROLE_IN_USE_SQL, [role_id, role_id])[0]["uses"]:
        raise HttpError(409, "El rol está asignado a usuarios; reasígnalos antes de eliminarlo.")
    if not pg.query(sql.DELETE_ROLE_SQL, [role_id]):
        raise HttpError(404, "Rol no encontrado")
    return _ok({"id": role_id})
