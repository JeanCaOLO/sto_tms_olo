"""API read-only de EFLOW (WMS/WMH): viajes, pedidos por viaje y catálogos.

Portado de las rutas EFLOW de server/index.mjs. País por ?pais=cr|ve
(default cr). Sin authorizer, igual que el Express: el frontend
(src/pages/planificacion/eflow-api.ts) llama sin token.

EFLOW_MODE=mock (default) sirve datos fijos sin tocar EFLOW; EFLOW_MODE=live
consulta los SQL Server reales (requiere VPC con ruta a EFLOW).
"""

import logging
import os
import re

from tms_common import eflow_db
from tms_common.errors import HttpError
from tms_common.event import path_param, query_params, route_key
from tms_common.handler import dispatch
from tms_common.responses import json_response

import live_source
import mock_source

logger = logging.getLogger()
logger.setLevel(logging.INFO)

DEFAULT_LIMIT = 100
MAX_LIMIT = 1000
INTEGER = re.compile(r"^-?\d+$")


def _source():
    return live_source if os.environ.get("EFLOW_MODE", "mock") == "live" else mock_source


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


def health(event: dict) -> dict:
    return _ok(_source().health(_country(event)))


def list_trips(event: dict) -> dict:
    requested = _int_or_none(query_params(event).get("limit")) or DEFAULT_LIMIT
    return _ok(_source().trips(_country(event), min(max(requested, 1), MAX_LIMIT)))


def get_trip(event: dict) -> dict:
    row = _source().trip(_country(event), _trip_id(event))
    if row is None:
        raise HttpError(404, "not_found")
    return _ok(row)


def list_trip_orders(event: dict) -> dict:
    return _ok(_source().trip_orders(_country(event), _trip_id(event)))


ROUTES = {
    "GET /api/health": health,
    "GET /api/viajes": list_trips,
    "GET /api/viajes/{id}": get_trip,
    "GET /api/viajes/{id}/pedidos": list_trip_orders,
    "GET /api/catalogos/rutas": lambda e: _ok(_source().routes(_country(e))),
    "GET /api/catalogos/transportistas": lambda e: _ok(_source().carriers(_country(e))),
    "GET /api/catalogos/conductores": lambda e: _ok(_source().drivers(_country(e), _carrier_id(e))),
    "GET /api/catalogos/vehiculos": lambda e: _ok(_source().vehicles(_country(e), _carrier_id(e))),
    "GET /api/catalogos/rutas-dias": lambda e: _ok(_source().route_days(_country(e))),
}


def handler(event: dict, _context: object) -> dict:
    """Errores con el shape del Express EFLOW: 4xx { error }, fallas de BD 502."""
    try:
        return dispatch(ROUTES, event)
    except HttpError as err:
        return json_response(err.status, {"error": str(err)})
    except Exception as err:
        logger.exception("%s -> fallo EFLOW", route_key(event))
        return json_response(502, {"error": "eflow_query_failed", "detail": str(err)})
