"""Wrapper de handler Lambda con el shape de error { data: null, error: { message } }
que ya espera el cliente del frontend. Portado y simplificado de main (sin el
binding de auditoría, que no aplica a este módulo)."""

from __future__ import annotations

import logging
from functools import wraps
from typing import Callable

from lib.tms_common.errors import HttpError
from lib.tms_common.event import route_key
from lib.tms_common.responses import json_response

logger = logging.getLogger()
logger.setLevel(logging.INFO)

Route = Callable[[dict], dict]


def _tms_error(status: int, message: str) -> dict:
    return json_response(status, {"data": None, "error": {"message": message}})


def dispatch(routes: dict[str, Route], event: dict) -> dict:
    route = routes.get(route_key(event))
    if route is None:
        raise HttpError(404, f"Ruta no soportada: {route_key(event)}")
    return route(event)


def tms_handler(routes: dict[str, Route]) -> Callable[[dict, object], dict]:
    @wraps(dispatch)
    def handler(event: dict, _context: object) -> dict:
        try:
            return dispatch(routes, event)
        except HttpError as err:
            return _tms_error(err.status, str(err))
        except Exception:
            logger.exception("Fallo no controlado en %s", route_key(event))
            return _tms_error(500, "Error interno del servidor")

    return handler
