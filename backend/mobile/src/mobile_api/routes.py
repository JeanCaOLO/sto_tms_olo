"""Tabla de rutas y handler Lambda (API Gateway HTTP API, payload 2.0).

Rutas públicas (sin token): salud, login, refresh, logout. El resto exige el token de la app y que el usuario sea
un chofer enlazado a un conductor; todos los handlers reciben el `Driver` ya validado.
"""

import logging

from . import audit, auth, consent, evidence, positions, presence, start, stops, trips
from .errors import HttpError
from .http import fail, ok, route_key

logger = logging.getLogger()
logger.setLevel(logging.INFO)

PREFIX = "/api/mobile/v1"

PUBLIC = {
    f"GET {PREFIX}/salud": lambda event, _driver: ok({"status": "ok"}),
    f"POST {PREFIX}/auth/login": auth.login,
    f"POST {PREFIX}/auth/refresh": auth.refresh,
    f"POST {PREFIX}/auth/logout": auth.logout,
}

PRIVATE = {
    f"GET {PREFIX}/mi-viaje": trips.my_trips,
    f"POST {PREFIX}/viajes/{{id}}/iniciar": start.start_trip,
    f"POST {PREFIX}/posiciones": positions.ingest_positions,
    f"POST {PREFIX}/presencia/heartbeat": presence.heartbeat,
    f"POST {PREFIX}/paradas/{{id}}/transicion": stops.transition_stop,
    f"POST {PREFIX}/paradas/{{id}}/novedades": stops.add_incident,
    f"POST {PREFIX}/paradas/{{id}}/devoluciones": stops.add_return,
    f"POST {PREFIX}/paradas/{{id}}/evidencias/upload-url": evidence.upload_url,
    f"POST {PREFIX}/paradas/{{id}}/evidencias": evidence.confirm,
    f"POST {PREFIX}/consentimiento-gps": consent.record_consent,
}

ROUTES = {**PUBLIC, **PRIVATE}


def resolve(event: dict) -> dict:
    """Normaliza el evento a la clave de ROUTES y a `pathParameters`.

    En AWS la Lambda cuelga de UNA ruta `ANY /api/mobile/v1/{proxy+}`: API Gateway entrega esa clave y
    `pathParameters = {"proxy": ...}`. Aquí se reconstruye la ruta real (método + `rawPath`) y sus `{id}`. Un evento que
    ya trae una clave conocida (servidor local, pruebas) pasa igual.
    """
    if route_key(event) in ROUTES:
        return event
    http = (event.get("requestContext") or {}).get("http") or {}
    method, path = str(http.get("method", "")).upper(), str(event.get("rawPath", "")).rstrip("/")
    parts = path.split("/")
    for key in ROUTES:
        verb, _, pattern = key.partition(" ")
        pattern_parts = pattern.split("/")
        if verb != method or len(pattern_parts) != len(parts):
            continue
        params = {}
        for want, got in zip(pattern_parts, parts):
            if want.startswith("{") and want.endswith("}") and got:
                params[want[1:-1]] = got
            elif want != got:
                break
        else:
            return {**event, "routeKey": key, "pathParameters": params}
    return event


def dispatch(event: dict) -> dict:
    event = resolve(event)
    key = route_key(event)
    if key in PUBLIC:
        return PUBLIC[key](event, None)
    route = PRIVATE.get(key)
    if route is None:
        raise HttpError(404, f"Ruta no soportada: {key}")
    driver = auth.authenticate(event)
    if not key.startswith("GET "):
        # Las escrituras le dicen a la BD quién es el actor (el trigger de auditoría del TMS lo registra).
        audit.bind(audit.actor(event, key, driver.auth_user_id, driver.email))
        try:
            return route(event, driver)
        finally:
            audit.clear()
    return route(event, driver)


def handler(event: dict, _context: object = None) -> dict:
    try:
        return dispatch(event)
    except HttpError as err:
        return fail(err.status, str(err), err.code)
    except Exception:  # noqa: BLE001 - el detalle queda en CloudWatch; al cliente no se le filtran internals
        logger.exception("Fallo no controlado en %s", route_key(event))
        return fail(500, "Error interno del servidor")
