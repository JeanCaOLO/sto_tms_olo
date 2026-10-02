"""API genérica de tablas: /api/data/{table} (GET, POST, PATCH, DELETE).

Equivalente reducido a supabase.from(table)... — mismo contrato que
server/tms-routes.mjs, consumido por src/lib/supabase.ts. Requiere el JWT
(Lambda authorizer de common-services).
"""

from tms_common import permissions, pg
from tms_common.errors import HttpError
from tms_common.event import auth_user, json_body, parse_json_param, path_param, query_params
from tms_common.handler import tms_handler
from tms_common.responses import json_response

from mutations import build_delete_query, build_insert_query, build_update_query
from schema import assert_table
from select_query import build_count_query, build_list_query
from table_modules import APP_USERS_READERS, SHARED_READ, module_for, read_modules


# Solo se escriben por /api/v1/admin (atómico y restringido a administradores);
# por la API genérica cualquier usuario logueado podría cambiarse el rol.
ADMIN_MANAGED = frozenset({"app_users", "roles", "user_scopes"})


def _table(event: dict) -> str:
    return assert_table(path_param(event, "table"))


def _writable_table(event: dict, action: str, values: object = None) -> str:
    table = _table(event)
    if table in ADMIN_MANAGED:
        raise HttpError(403, f'"{table}" se administra desde Configuración (/api/v1/admin)')
    caller = permissions.for_event(event)
    caller.require(module_for(table), action)
    _require_allowed_countries(caller, values)
    return table


def _require_allowed_countries(caller: permissions.Permissions, values: object) -> None:
    """No se puede escribir una fila de un país que el rol no ve."""
    allowed = caller.country_filter
    rows = values if isinstance(values, list) else [values]
    if allowed is None:
        return
    for row in rows:
        country = row.get("country_id") if isinstance(row, dict) else None
        if country is not None and str(country) not in allowed:
            raise HttpError(403, "Tu rol no tiene acceso a ese país.")


def _readable(event: dict, table: str, caller: permissions.Permissions, filters: list) -> list:
    """Devuelve los filtros a aplicar; 403 si el rol no ve ningún módulo que lea la tabla."""
    if caller.is_admin or table in SHARED_READ:
        return filters
    if table == "app_users":
        if any(caller.can(m, "view") for m in APP_USERS_READERS):
            return filters
        return [*filters, ["auth_user_id", "eq", auth_user(event)["id"]]]
    if not any(caller.can(m, "view") for m in read_modules(table)):
        raise HttpError(403, f'Tu rol no tiene permiso para ver "{table}".')
    return filters


def _body(event: dict) -> dict:
    body = json_body(event)
    return body if isinstance(body, dict) else {}


def _shape(rows: list[dict], params: dict) -> dict:
    data: object = rows
    if params.get("single") == "true":
        if len(rows) != 1:
            raise HttpError(406, "Se esperaba exactamente una fila")
        data = rows[0]
    elif params.get("maybeSingle") == "true":
        data = rows[0] if rows else None
    result = {"data": data, "error": None}
    if params.get("count") == "exact":
        result["count"] = len(rows)
    return result


def list_rows(event: dict) -> dict:
    table = _table(event)
    params = query_params(event)
    caller = permissions.for_event(event)
    filters = _readable(event, table, caller, parse_json_param(params.get("filters"), "filters") or [])
    countries = caller.country_filter
    if params.get("head") == "true":
        sql, args = build_count_query(table, filters, countries)
        total = pg.query(sql, args)[0]["count"]
        return json_response(200, {"data": None, "count": total, "error": None})
    order = parse_json_param(params.get("order"), "order")
    sql, args = build_list_query(table, params.get("select") or "*", filters, order, params.get("limit"), countries)
    return json_response(200, _shape(pg.query(sql, args), params))


def _mutation_response(rows: list[dict], body: dict) -> dict:
    return json_response(200, {"data": rows if body.get("returning") else None, "error": None})


def insert_rows(event: dict) -> dict:
    body = _body(event)
    sql, args = build_insert_query(_writable_table(event, "create", body.get("values")), body.get("values"))
    return _mutation_response(pg.query(sql, args), body)


def update_rows(event: dict) -> dict:
    body = _body(event)
    sql, args = build_update_query(_writable_table(event, "edit", body.get("values")), body.get("values"),
                                   body.get("filters"))
    return _mutation_response(pg.query(sql, args), body)


def delete_rows(event: dict) -> dict:
    body = _body(event)
    sql, args = build_delete_query(_writable_table(event, "delete"), body.get("filters"))
    return _mutation_response(pg.query(sql, args), body)


ROUTES = {
    "GET /api/data/{table}": list_rows,
    "POST /api/data/{table}": insert_rows,
    "PATCH /api/data/{table}": update_rows,
    "DELETE /api/data/{table}": delete_rows,
}

handler = tms_handler(ROUTES)
