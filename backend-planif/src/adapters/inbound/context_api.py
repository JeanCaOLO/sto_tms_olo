"""Adaptador inbound HTTP API → casos de uso del contexto operativo.

Contrato idéntico al de `origin/main:backend/context/src/app.py`: jerarquía
País → Almacén → Cliente → Cliente Final → Punto de Entrega (filtrada por el
scope del usuario) + `/me/context` + CRUD de puntos de entrega. Sin `?pais`: el
país sale del scope. Un único `tms_handler(ROUTES)` cubre los nueve endpoints.
"""

from __future__ import annotations

from functools import wraps

from app import wiring
from domain.context.delivery_points import DatosInvalidos
from lib.tms_common.errors import HttpError
from lib.tms_common.event import auth_user, json_body, path_param
from lib.tms_common.handler import tms_handler
from lib.tms_common.responses import json_response


def _ok(rows: object) -> dict:
    return json_response(200, {"data": rows, "error": None})


def _body(event: dict) -> dict:
    body = json_body(event)
    return body if isinstance(body, dict) else {}


# GET /api/v1/countries
def list_countries(event: dict) -> dict:
    return _ok(wiring.build_context_service().list_countries(auth_user(event)))


# GET /api/v1/countries/{id}/warehouses
def list_warehouses(event: dict) -> dict:
    return _ok(wiring.build_context_service().list_warehouses(auth_user(event), path_param(event, "id")))


# GET /api/v1/warehouses/{id}/customers
def list_customers(event: dict) -> dict:
    return _ok(wiring.build_context_service().list_customers(auth_user(event), path_param(event, "id")))


# GET /api/v1/customers/{id}/final-customers
def list_final_customers(event: dict) -> dict:
    return _ok(wiring.build_context_service().list_final_customers(auth_user(event), path_param(event, "id")))


# GET /api/v1/final-customers/{id}/delivery-points
def list_delivery_points(event: dict) -> dict:
    return _ok(wiring.build_context_service().list_delivery_points(auth_user(event), path_param(event, "id")))


# GET /api/v1/me/context
def my_context(event: dict) -> dict:
    return _ok(wiring.build_context_service().my_context(auth_user(event)))


# POST /api/v1/delivery-points
def create_point(event: dict) -> dict:
    svc = wiring.build_context_service()
    return _ok(svc.create_point(event, auth_user(event), _body(event)))


# PATCH /api/v1/delivery-points/{id}
def update_point(event: dict) -> dict:
    svc = wiring.build_context_service()
    return _ok(svc.update_point(event, auth_user(event), path_param(event, "id"), _body(event)))


# DELETE /api/v1/delivery-points/{id}
def delete_point(event: dict) -> dict:
    svc = wiring.build_context_service()
    return _ok(svc.delete_point(event, auth_user(event), path_param(event, "id")))


def _translate_domain_errors(route):
    """Mapea errores de dominio (validación de puntos) a HttpError 400."""

    @wraps(route)
    def wrapped(event: dict) -> dict:
        try:
            return route(event)
        except DatosInvalidos as exc:
            raise HttpError(400, str(exc)) from exc

    return wrapped


_RAW_ROUTES = {
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

ROUTES = {key: _translate_domain_errors(route) for key, route in _RAW_ROUTES.items()}

handler = tms_handler(ROUTES)
