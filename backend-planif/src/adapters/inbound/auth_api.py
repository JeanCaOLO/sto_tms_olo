"""Adaptador inbound HTTP API → casos de uso de autenticación (/api/auth/*).

Contrato idéntico al de `origin/main:backend/auth/src/app.py`: mismas rutas,
mismos cuerpos de respuesta y mismos códigos (200/401/403/409). `login` es la
única ruta pública; el resto pasa por el Lambda authorizer. Un único
`tms_handler(ROUTES)` cubre los cuatro endpoints.
"""

from __future__ import annotations

from functools import wraps

from app import wiring
from app.auth_service import CredencialesIncorrectas, EmailYaExiste, UsuarioInactivo
from domain.auth.credenciales import CredencialesInvalidas, PasswordDebil, parse_credenciales
from lib.tms_common import audit
from lib.tms_common.errors import HttpError
from lib.tms_common.event import auth_user, json_body
from lib.tms_common.handler import tms_handler
from lib.tms_common.responses import empty_response, json_response


def _credenciales(event: dict):
    body = json_body(event)
    email = body.get("email") if isinstance(body, dict) else None
    password = body.get("password") if isinstance(body, dict) else None
    # parse_credenciales lanza CredencialesInvalidas (→ HttpError 400 en tms_handler
    # vía el dominio); el contrato de main devuelve 400 "email y password son requeridos".
    return parse_credenciales(email, password)


# POST /api/auth/login
def login(event: dict) -> dict:
    creds = _credenciales(event)
    svc = wiring.build_auth_service()
    try:
        session = svc.login(creds)
    except CredencialesIncorrectas:
        audit.record(event, "login_failed", email=creds.email, actor_type="anonymous",
                     metadata={"reason": "invalid_credentials"})
        body = {"error": "invalid_credentials", "message": "Correo o contraseña incorrectos."}
        return json_response(401, body)
    except UsuarioInactivo:
        # El usuario existe: se recupera su id para el registro de auditoría.
        credential = wiring.AuroraCredencialRepo().por_email(creds.email)
        user_id = credential.auth_user_id if credential else None
        audit.record(event, "login_blocked", email=creds.email, auth_user_id=user_id,
                     metadata={"reason": "inactive_user"})
        return json_response(403, {"error": "inactive_user", "message": "Tu usuario está desactivado."})
    audit.record(event, "login", email=session["user"]["email"], auth_user_id=session["user"]["id"])
    return json_response(200, {"data": session, "error": None})


# POST /api/auth/signup
def sign_up(event: dict) -> dict:
    creds = _credenciales(event)
    svc = wiring.build_auth_service()
    try:
        nuevo = svc.sign_up(creds)
    except EmailYaExiste:
        body = {"error": "email_exists", "message": "Ya existe un usuario con ese correo."}
        return json_response(409, body)
    return json_response(200, {"data": {"user": {"id": nuevo.id, "email": nuevo.email}}, "error": None})


# GET /api/auth/session
def session(event: dict) -> dict:
    return json_response(200, {"data": {"user": auth_user(event)}, "error": None})


# POST /api/auth/logout
def sign_out(event: dict) -> dict:
    if audit.actor(event)["auth_user_id"]:
        audit.record(event, "logout")
    return empty_response(204)


def _translate_domain_errors(route):
    """Mapea errores del dominio de credenciales a HttpError 400; `tms_handler`
    los convierte en la envoltura de error del frontend."""

    @wraps(route)
    def wrapped(event: dict) -> dict:
        try:
            return route(event)
        except (CredencialesInvalidas, PasswordDebil) as exc:
            raise HttpError(400, str(exc)) from exc

    return wrapped


_RAW_ROUTES = {
    "POST /api/auth/login": login,
    "POST /api/auth/signup": sign_up,
    "GET /api/auth/session": session,
    "POST /api/auth/logout": sign_out,
}

ROUTES = {key: _translate_domain_errors(route) for key, route in _RAW_ROUTES.items()}

handler = tms_handler(ROUTES)
