"""Matriz de permisos por rol (sql/15): catálogo, lectura/escritura por rol y
permisos efectivos del usuario que llama."""

from tms_common import pg
from tms_common import permissions as perms
from tms_common.errors import HttpError
from tms_common.event import json_body, path_param
from tms_common.responses import json_response

from admin_access import require_admin

CATALOG_SQL = "SELECT key, group_key AS \"group\", path FROM app_modules ORDER BY sort_order"
ROLE_SQL = "SELECT id, name, COALESCE(all_countries, true) AS all_countries FROM roles WHERE id = %s"
COUNTRIES_EXIST_SQL = "SELECT id FROM countries WHERE id = ANY(%s::uuid[])"
DELETE_PERMISSIONS_SQL = "DELETE FROM role_permissions WHERE role_id = %s"
INSERT_PERMISSION_SQL = "INSERT INTO role_permissions (role_id, module_key, action) VALUES (%s, %s, %s)"
DELETE_COUNTRIES_SQL = "DELETE FROM role_countries WHERE role_id = %s"
INSERT_COUNTRY_SQL = "INSERT INTO role_countries (role_id, country_id) VALUES (%s, %s)"
UPDATE_ALL_COUNTRIES_SQL = "UPDATE roles SET all_countries = %s WHERE id = %s"


def _ok(data: object) -> dict:
    return json_response(200, {"data": data, "error": None})


def _role(role_id: str) -> dict:
    rows = pg.query(ROLE_SQL, [role_id])
    if not rows:
        raise HttpError(404, "Rol no encontrado")
    return rows[0]


def _matrix(role_id: str) -> dict:
    role = _role(role_id)
    modules = {key: [a for a in perms.ACTIONS if a in actions]
               for key, actions in perms.role_modules(role_id).items()}
    countries = [] if role["all_countries"] else [
        str(row["country_id"]) for row in pg.query(perms.ROLE_COUNTRIES_SQL, [role_id])]
    return {"modules": modules, "all_countries": bool(role["all_countries"]), "country_ids": countries}


def _valid_modules(raw: object) -> list[tuple[str, str]]:
    if not isinstance(raw, dict):
        raise HttpError(400, '"modules" debe ser un objeto { módulo: [acciones] }')
    known = {row["key"] for row in pg.query(perms.MODULES_SQL)}
    pairs = []
    for key, actions in raw.items():
        if key not in known:
            raise HttpError(400, f'Módulo desconocido: "{key}"')
        if not isinstance(actions, list) or any(a not in perms.ACTIONS for a in actions):
            raise HttpError(400, f'Acciones inválidas en "{key}"; válidas: {", ".join(perms.ACTIONS)}')
        pairs.extend((key, action) for action in dict.fromkeys(actions))
    return pairs


def _valid_countries(body: dict) -> tuple[bool, list[str]]:
    all_countries = body.get("all_countries", True)
    if not isinstance(all_countries, bool):
        raise HttpError(400, '"all_countries" debe ser true o false')
    ids = list(dict.fromkeys(body.get("country_ids") or []))
    if all_countries:
        return True, []
    if not ids:
        raise HttpError(400, "Elegí al menos un país o marcá todos los países.")
    found = {str(row["id"]) for row in pg.query(COUNTRIES_EXIST_SQL, [ids])}
    missing = [i for i in ids if i not in found]
    if missing:
        raise HttpError(400, f"País desconocido: {missing[0]}")
    return False, ids


def catalog(event: dict) -> dict:
    require_admin(event)
    return _ok({"modules": pg.query(CATALOG_SQL), "actions": list(perms.ACTIONS)})


def get_role_permissions(event: dict) -> dict:
    require_admin(event)
    return _ok(_matrix(path_param(event, "id")))


def put_role_permissions(event: dict) -> dict:
    require_admin(event)
    role_id = path_param(event, "id")
    if _role(role_id)["name"] in perms.ADMIN_ROLES:
        raise HttpError(409, "Un rol administrador tiene todos los permisos; no se edita su matriz.")
    body = json_body(event)
    body = body if isinstance(body, dict) else {}
    pairs = _valid_modules(body.get("modules", {}))
    all_countries, country_ids = _valid_countries(body)
    with pg.transaction() as run:
        run(DELETE_PERMISSIONS_SQL, [role_id])
        for key, action in pairs:
            run(INSERT_PERMISSION_SQL, [role_id, key, action])
        run(DELETE_COUNTRIES_SQL, [role_id])
        for country_id in country_ids:
            run(INSERT_COUNTRY_SQL, [role_id, country_id])
        run(UPDATE_ALL_COUNTRIES_SQL, [all_countries, role_id])
    return _ok(_matrix(role_id))


def my_permissions(event: dict) -> dict:
    return _ok(perms.for_event(event).to_json())
