import logging
from functools import wraps
from typing import Callable

from . import audit
from .errors import HttpError
from .event import route_key
from .responses import json_response

logger = logging.getLogger()
logger.setLevel(logging.INFO)

Route = Callable[[dict], dict]


def dispatch(routes: dict[str, Route], event: dict) -> dict:
    route = routes.get(route_key(event))
    if route is None:
        raise HttpError(404, f"Ruta no soportada: {route_key(event)}")
    if not audit.is_write(event):
        return route(event)
    # Las rutas que escriben le dicen a la BD quién es el actor (trigger de sql/16).
    audit.bind(event)
    try:
        return route(event)
    finally:
        _clear_actor(event)


def _clear_actor(event: dict) -> None:
    try:
        audit.clear()
    except Exception:
        # La conexión se cayó: la próxima request reconecta y el actor no persiste.
        logger.exception("No se pudo limpiar el actor de auditoría en %s", route_key(event))


def _tms_error(status: int, message: str) -> dict:
    return json_response(status, {"data": None, "error": {"message": message}})


def tms_handler(routes: dict[str, Route]) -> Callable[[dict, object], dict]:
    """Handler Lambda con el shape de error { data: null, error: { message } }
    que ya espera el cliente del frontend (src/lib/supabase.ts)."""

    @wraps(dispatch)
    def handler(event: dict, _context: object) -> dict:
        try:
            return dispatch(routes, event)
        except HttpError as err:
            return _tms_error(err.status, str(err))
        except Exception:
            # El detalle queda en CloudWatch; al cliente no se le filtran internals.
            logger.exception("Fallo no controlado en %s", route_key(event))
            return _tms_error(500, "Error interno del servidor")

    return handler
