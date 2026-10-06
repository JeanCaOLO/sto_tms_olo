"""Adaptador inbound HTTP API → casos de uso EFLOW (read-only).

Contrato idéntico al de `origin/main:backend/eflow/src/app.py`: 9 rutas GET,
`?pais=cr|ve` (default cr), sin authorizer (público, igual que el Express: el
cliente eflow-api.ts no manda token). El handler propio replica el shape de
error del Express EFLOW: 4xx { error } con su status; fallas de BD → 502
{ error: "eflow_query_failed", detail }. Montos NUMERIC como float (decimal_as).
"""

from __future__ import annotations

import logging
import re

from app import wiring
from lib.tms_common import eflow_db
from lib.tms_common.errors import HttpError
from lib.tms_common.event import path_param, query_params, route_key
from lib.tms_common.responses import json_response

logger = logging.getLogger()
logger.setLevel(logging.INFO)

INTEGER = re.compile(r"^-?\d+$")


def _ok(body: object) -> dict:
    return json_response(200, body, decimal_as=float)


def _country(event: dict) -> str:
    return eflow_db.normalize_country(query_params(event).get("pais"))


def _int_or_none(raw: str | None) -> int | None:
    return int(raw) if raw is not None and INTEGER.match(raw) else None


def _trip_id(event: dict) -> int:
    trip_id = _int_or_none(path_param(event, "id"))
    if trip_id is None:
        raise HttpError(400, "invalid_id")
    return trip_id


def _carrier_id(event: dict) -> int | None:
    return _int_or_none(query_params(event).get("transportistaId"))


def _limit(event: dict) -> int | None:
    return _int_or_none(query_params(event).get("limit"))


def health(event: dict) -> dict:
    return _ok(wiring.build_eflow_service().health(_country(event)))


def list_trips(event: dict) -> dict:
    return _ok(wiring.build_eflow_service().trips(_country(event), _limit(event)))


def get_trip(event: dict) -> dict:
    return _ok(wiring.build_eflow_service().trip(_country(event), _trip_id(event)))


def list_trip_orders(event: dict) -> dict:
    return _ok(wiring.build_eflow_service().trip_orders(_country(event), _trip_id(event)))


def list_routes(event: dict) -> dict:
    return _ok(wiring.build_eflow_service().routes(_country(event)))


def list_carriers(event: dict) -> dict:
    return _ok(wiring.build_eflow_service().carriers(_country(event)))


def list_drivers(event: dict) -> dict:
    return _ok(wiring.build_eflow_service().drivers(_country(event), _carrier_id(event)))


def list_vehicles(event: dict) -> dict:
    return _ok(wiring.build_eflow_service().vehicles(_country(event), _carrier_id(event)))


def list_route_days(event: dict) -> dict:
    return _ok(wiring.build_eflow_service().route_days(_country(event)))


ROUTES = {
    "GET /api/health": health,
    "GET /api/viajes": list_trips,
    "GET /api/viajes/{id}": get_trip,
    "GET /api/viajes/{id}/pedidos": list_trip_orders,
    "GET /api/catalogos/rutas": list_routes,
    "GET /api/catalogos/transportistas": list_carriers,
    "GET /api/catalogos/conductores": list_drivers,
    "GET /api/catalogos/vehiculos": list_vehicles,
    "GET /api/catalogos/rutas-dias": list_route_days,
}


def handler(event: dict, _context: object) -> dict:
    """Errores con el shape del Express EFLOW: 4xx { error }, fallas de BD 502."""
    route = ROUTES.get(route_key(event))
    if route is None:
        return json_response(404, {"error": f"Ruta no soportada: {route_key(event)}"})
    try:
        return route(event)
    except HttpError as err:
        return json_response(err.status, {"error": str(err)})
    except Exception as err:  # noqa: BLE001 — cualquier fallo de EFLOW se reporta 502
        logger.exception("%s -> fallo EFLOW", route_key(event))
        return json_response(502, {"error": "eflow_query_failed", "detail": str(err)})
