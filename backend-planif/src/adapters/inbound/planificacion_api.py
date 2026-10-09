"""Adaptador inbound HTTP API → casos de uso de Planificación 2 (contrato §4).

Prefijo `/api/v1/planificacion`. Envoltura de respuesta `{ data, error }` (igual
que /api/data). País/almacén salen del contexto operativo, NO de `?pais`. Un
único `tms_handler(ROUTES)` cubre los 8 endpoints (mismo patrón que context/app
de main); la SAM apunta cada ruta a este handler.
"""

from __future__ import annotations

import re
from functools import wraps

from app import wiring
from app.planificacion_service import PlanNoEditable, PlanNoEncontrado
from app.serializers import pedido_to_dict
from domain.planes.estados import CANCELLED, COMPLETED, CONFIRMED
from domain.planes.estados import TransicionInvalida
from domain.planes import estados_viaje
from domain.planes.estados_viaje import TransicionViajeInvalida
from domain.planificacion.motor import CapacidadExcedida
from lib.tms_common.errors import HttpError
from lib.tms_common.event import json_body, path_param, query_params
from lib.tms_common.handler import tms_handler
from lib.tms_common.responses import ok

ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _iso_date(raw: str | None, campo: str) -> str:
    if not raw or not ISO_DATE.match(raw):
        raise HttpError(400, f"{campo} debe tener formato YYYY-MM-DD")
    return raw


def _body_with_context(event: dict) -> dict:
    body = json_body(event)
    event["_parsed_body"] = body if isinstance(body, dict) else {}
    return event["_parsed_body"]


# GET /pedidos?fecha_entrega=YYYY-MM-DD
def list_pedidos(event: dict) -> dict:
    ctx = wiring.resolve_context(event)
    fecha = _iso_date(query_params(event).get("fecha_entrega"), "fecha_entrega")
    pedidos = wiring.build_service().listar_pedidos(ctx, fecha)
    return ok([pedido_to_dict(p) for p in pedidos])


# GET /pedidos/{id}/articulos  → líneas/artículos del pedido
def list_articulos(event: dict) -> dict:
    wiring.resolve_context(event)
    svc = wiring.build_service()
    return ok(svc.articulos_de_pedido(path_param(event, "id")))


# POST /planes  { plan_date, warehouse_id? }
def crear_plan(event: dict) -> dict:
    body = _body_with_context(event)
    ctx = wiring.resolve_context(event)
    fecha = _iso_date(body.get("plan_date"), "plan_date")
    svc = wiring.build_service()
    plan = svc.crear_plan(ctx, fecha)
    return ok(svc.a_dict(plan))


# GET /planes?status=&fecha=
def listar_planes(event: dict) -> dict:
    ctx = wiring.resolve_context(event)
    params = query_params(event)
    fecha = params.get("fecha")
    if fecha is not None:
        fecha = _iso_date(fecha, "fecha")
    svc = wiring.build_service()
    planes = svc.listar_planes(ctx, params.get("status"), fecha)
    return ok([svc.a_dict(p) for p in planes])


# GET /planes/{id}
def obtener_plan(event: dict) -> dict:
    wiring.resolve_context(event)  # autoriza el contexto antes de leer
    svc = wiring.build_service()
    plan = svc.obtener_plan(path_param(event, "id"))
    return ok(svc.a_dict(plan))


# PUT /planes/{id}  { trips: [{vehicle_id, driver_id?, delivery_zone?, order_ids:[...]}] }
def editar_plan(event: dict) -> dict:
    body = _body_with_context(event)
    wiring.resolve_context(event)
    asignaciones = body.get("trips") or body.get("viajes") or []
    svc = wiring.build_service()
    plan = svc.editar_plan(path_param(event, "id"), asignaciones)
    return ok(svc.a_dict(plan))


def _transicion(destino: str):
    def handler(event: dict) -> dict:
        wiring.resolve_context(event)
        svc = wiring.build_service()
        plan = svc.transicionar(path_param(event, "id"), destino)
        return ok(svc.a_dict(plan))

    return handler


def _transicion_viaje(destino: str):
    def handler(event: dict) -> dict:
        wiring.resolve_context(event)
        svc = wiring.build_service()
        plan = svc.transicionar_viaje(path_param(event, "tripId"), destino)
        return ok(svc.a_dict(plan))

    return handler


def _translate_domain_errors(route):
    """Envuelve un route para mapear errores de dominio a HttpError; el wrapper
    `tms_handler` los convierte en la envoltura {data:null, error:{message}}."""

    @wraps(route)
    def wrapped(event: dict) -> dict:
        try:
            return route(event)
        except PlanNoEncontrado as exc:
            raise HttpError(404, str(exc)) from exc
        except (PlanNoEditable, TransicionInvalida, TransicionViajeInvalida, CapacidadExcedida) as exc:
            raise HttpError(409, str(exc)) from exc

    return wrapped


_RAW_ROUTES = {
    "GET /api/v1/planificacion/pedidos": list_pedidos,
    "GET /api/v1/planificacion/pedidos/{id}/articulos": list_articulos,
    "POST /api/v1/planificacion/planes": crear_plan,
    "GET /api/v1/planificacion/planes": listar_planes,
    "GET /api/v1/planificacion/planes/{id}": obtener_plan,
    "PUT /api/v1/planificacion/planes/{id}": editar_plan,
    "POST /api/v1/planificacion/planes/{id}/confirmar": _transicion(CONFIRMED),
    "POST /api/v1/planificacion/planes/{id}/completar": _transicion(COMPLETED),
    "POST /api/v1/planificacion/planes/{id}/cancelar": _transicion(CANCELLED),
    "POST /api/v1/planificacion/viajes/{tripId}/completar": _transicion_viaje(estados_viaje.COMPLETED),
    "POST /api/v1/planificacion/viajes/{tripId}/cancelar": _transicion_viaje(estados_viaje.CANCELLED),
    "POST /api/v1/planificacion/viajes/{tripId}/reabrir": _transicion_viaje(estados_viaje.PENDING),
}

ROUTES = {key: _translate_domain_errors(route) for key, route in _RAW_ROUTES.items()}

# Un único handler cubre los 8 endpoints (patrón context/app de main).
# tms_handler enruta por routeKey y aporta el shape de error del frontend.
handler = tms_handler(ROUTES)
