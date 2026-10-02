"""API de jerarquía País → Almacén → Cliente → Cliente Final → Punto de Entrega.

Portado de server/tms-context-routes.mjs. A diferencia de /api/data/{table},
estos endpoints SÍ filtran por el scope operativo del usuario antes de
devolver filas.
"""

from tms_common import pg
from tms_common.errors import HttpError
from tms_common.event import auth_user, path_param
from tms_common.handler import tms_handler
from tms_common.responses import json_response

from context_queries import (COUNTRIES_SQL, CUSTOMERS_SQL, DELIVERY_POINTS_SQL,
                             FINAL_CUSTOMER_OWNER_SQL, FINAL_CUSTOMERS_SQL, WAREHOUSES_SQL)
from delivery_points import create_point, delete_point, update_point
from scopes import authorize, is_global, resolve_scopes, scopes_payload


def _ok(rows: object) -> dict:
    return json_response(200, {"data": rows, "error": None})


def list_countries(event: dict) -> dict:
    scopes = resolve_scopes(auth_user(event))
    if any(is_global(scope) for scope in scopes):
        return _ok(pg.query(COUNTRIES_SQL.format(scope_clause=""), []))
    ids = sorted({scope.countryId for scope in scopes if scope.countryId})
    if not ids:
        return _ok([])  # sin scope de país -> nada
    return _ok(pg.query(COUNTRIES_SQL.format(scope_clause="AND id::text = ANY(%s)"), [ids]))


def list_warehouses(event: dict) -> dict:
    country_id = path_param(event, "id")
    authorize(auth_user(event), country_id=country_id)
    return _ok(pg.query(WAREHOUSES_SQL, [country_id]))


def list_customers(event: dict) -> dict:
    warehouse_id = path_param(event, "id")
    authorize(auth_user(event), warehouse_id=warehouse_id)
    return _ok(pg.query(CUSTOMERS_SQL, [warehouse_id]))


def list_final_customers(event: dict) -> dict:
    customer_id = path_param(event, "id")
    authorize(auth_user(event), customer_id=customer_id)
    return _ok(pg.query(FINAL_CUSTOMERS_SQL, [customer_id]))


def list_delivery_points(event: dict) -> dict:
    final_customer_id = path_param(event, "id")
    owners = pg.query(FINAL_CUSTOMER_OWNER_SQL, [final_customer_id])
    if not owners:
        raise HttpError(404, f"Cliente final no encontrado: {final_customer_id}")
    # final_customers no trae país/almacén propio: se autoriza vía su customer.
    authorize(auth_user(event), customer_id=str(owners[0]["customer_id"]))
    return _ok(pg.query(DELIVERY_POINTS_SQL, [final_customer_id]))


def my_context(event: dict) -> dict:
    return _ok({"scopes": scopes_payload(resolve_scopes(auth_user(event)))})


ROUTES = {
    "GET /api/v1/countries": list_countries,
    "GET /api/v1/countries/{id}/warehouses": list_warehouses,
    "GET /api/v1/warehouses/{id}/customers": list_customers,
    "GET /api/v1/customers/{id}/final-customers": list_final_customers,
    "GET /api/v1/final-customers/{id}/delivery-points": list_delivery_points,
    "GET /api/v1/me/context": my_context,
    "POST /api/v1/delivery-points": create_point,
    "PATCH /api/v1/delivery-points/{id}": update_point,
    "DELETE /api/v1/delivery-points/{id}": delete_point,
}

handler = tms_handler(ROUTES)
