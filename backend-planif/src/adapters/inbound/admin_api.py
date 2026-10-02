"""Adaptador inbound HTTP API → casos de uso de administración (/api/v1/admin/*).

Contrato idéntico al de `origin/main:backend/admin/src/app.py`: mismas 16 rutas,
mismos cuerpos de respuesta ({data, error, [next_cursor]}) y mismos códigos
(200/400/401/403/404/409). Todas exigen el JWT (Lambda authorizer); la matriz de
permisos y el rol administrador los resuelve el servicio.

Igual que en main, las rutas que escriben fijan el actor de auditoría en la
conexión (trigger de sql/16) antes de ejecutar y lo limpian al terminar. Por eso
este módulo usa su propio wrapper en vez del `tms_handler` compartido (que se
simplificó sin el binding para los otros módulos).
"""

from __future__ import annotations

import logging
from functools import wraps
from typing import Callable

from app import wiring
from domain.admin.payload import DatosInvalidos
from lib.tms_common import audit
from lib.tms_common.errors import HttpError
from lib.tms_common.event import json_body, path_param, query_params, route_key
from lib.tms_common.responses import json_response

logger = logging.getLogger()
logger.setLevel(logging.INFO)


def _ok(data: object, **extra: object) -> dict:
    return json_response(200, {"data": data, "error": None, **extra})


def _body(event: dict) -> dict:
    body = json_body(event)
    return body if isinstance(body, dict) else {}


# --- Usuarios ---------------------------------------------------------------
def list_users(event: dict) -> dict:
    return _ok(wiring.build_admin_service().list_users(event))


def create_user(event: dict) -> dict:
    return _ok(wiring.build_admin_service().create_user(event, _body(event)))


def update_user(event: dict) -> dict:
    return _ok(wiring.build_admin_service().update_user(event, path_param(event, "id"), _body(event)))


def delete_user(event: dict) -> dict:
    return _ok(wiring.build_admin_service().delete_user(event, path_param(event, "id")))


def reset_password(event: dict) -> dict:
    return _ok(wiring.build_admin_service().reset_password(event, path_param(event, "id"), _body(event)))


# --- Roles ------------------------------------------------------------------
def list_roles(event: dict) -> dict:
    return _ok(wiring.build_admin_service().list_roles(event))


def create_role(event: dict) -> dict:
    return _ok(wiring.build_admin_service().create_role(event, _body(event)))


def update_role(event: dict) -> dict:
    return _ok(wiring.build_admin_service().update_role(event, path_param(event, "id"), _body(event)))


def delete_role(event: dict) -> dict:
    return _ok(wiring.build_admin_service().delete_role(event, path_param(event, "id")))


# --- Matriz de permisos -----------------------------------------------------
def catalog(event: dict) -> dict:
    return _ok(wiring.build_admin_service().catalog(event))


def get_role_permissions(event: dict) -> dict:
    return _ok(wiring.build_admin_service().get_role_permissions(event, path_param(event, "id")))


def put_role_permissions(event: dict) -> dict:
    return _ok(wiring.build_admin_service().put_role_permissions(event, path_param(event, "id"), _body(event)))


def my_permissions(event: dict) -> dict:
    return _ok(wiring.build_admin_service().my_permissions(event))


# --- Bitácora ---------------------------------------------------------------
def list_events(event: dict) -> dict:
    page, next_cursor = wiring.build_admin_service().list_events(event, query_params(event))
    return _ok(page, next_cursor=next_cursor)


def get_event(event: dict) -> dict:
    return _ok(wiring.build_admin_service().get_event(event, path_param(event, "id")))


def record_client_event(event: dict) -> dict:
    return _ok(wiring.build_admin_service().record_client_event(event, _body(event)))


def _translate_domain_errors(route: Callable[[dict], dict]) -> Callable[[dict], dict]:
    """Mapea errores del dominio (validación de payloads) a HttpError 400."""

    @wraps(route)
    def wrapped(event: dict) -> dict:
        try:
            return route(event)
        except DatosInvalidos as exc:
            raise HttpError(400, str(exc)) from exc

    return wrapped


_RAW_ROUTES = {
    "GET /api/v1/admin/users": list_users,
    "POST /api/v1/admin/users": create_user,
    "PATCH /api/v1/admin/users/{id}": update_user,
    "DELETE /api/v1/admin/users/{id}": delete_user,
    "POST /api/v1/admin/users/{id}/password": reset_password,
    "GET /api/v1/admin/roles": list_roles,
    "POST /api/v1/admin/roles": create_role,
    "PATCH /api/v1/admin/roles/{id}": update_role,
    "DELETE /api/v1/admin/roles/{id}": delete_role,
    "GET /api/v1/admin/permissions/catalog": catalog,
    "GET /api/v1/admin/roles/{id}/permissions": get_role_permissions,
    "PUT /api/v1/admin/roles/{id}/permissions": put_role_permissions,
    "GET /api/v1/me/permissions": my_permissions,
    "GET /api/v1/admin/audit": list_events,
    "GET /api/v1/admin/audit/{id}": get_event,
    "POST /api/v1/audit/events": record_client_event,
}

ROUTES = {key: _translate_domain_errors(route) for key, route in _RAW_ROUTES.items()}


def _tms_error(status: int, message: str) -> dict:
    return json_response(status, {"data": None, "error": {"message": message}})


def _dispatch(event: dict) -> dict:
    route = ROUTES.get(route_key(event))
    if route is None:
        raise HttpError(404, f"Ruta no soportada: {route_key(event)}")
    if not audit.is_write(event):
        return route(event)
    # Las rutas que escriben le dicen a la BD quién es el actor (trigger de sql/16).
    audit.bind(event)
    try:
        return route(event)
    finally:
        try:
            audit.clear()
        except Exception:
            logger.exception("No se pudo limpiar el actor de auditoría en %s", route_key(event))


def handler(event: dict, _context: object) -> dict:
    try:
        return _dispatch(event)
    except HttpError as err:
        return _tms_error(err.status, str(err))
    except Exception:
        logger.exception("Fallo no controlado en %s", route_key(event))
        return _tms_error(500, "Error interno del servidor")
