"""Autenticación de la app del chofer: login propio, refresh con rotación y contexto del conductor.

Las credenciales son las MISMAS del TMS (`auth_credentials` + `app_users`), pero este backend firma sus propios
tokens (secreto propio) y solo deja entrar a usuarios con rol Chofer enlazados a un conductor
(`drivers.app_user_id`). Un token de la app no sirve en el TMS ni al revés.
"""

import time
from dataclasses import dataclass
from datetime import datetime, timezone

import jwt

from . import audit, config, db, presence, security, sql
from .errors import HttpError
from .http import body_dict, headers, ok
from .logic import aware


MAX_LOGIN_FAILURES = 5
MAX_LOGIN_FAILURES_PER_IP = 30
LOGIN_WINDOW_SECONDS = 15 * 60
# Un refresh token ya canjeado que llega dentro de esta ventana es el reintento de una respuesta que se perdió por el
# camino (mala señal), no un robo: se le entrega una sesión nueva en vez de revocar todas.
REFRESH_REUSE_GRACE_SECONDS = 60


@dataclass(frozen=True)
class Driver:
    app_user_id: str
    auth_user_id: str
    organization_id: str
    driver_id: str
    email: str | None
    full_name: str | None


def _driver_from_row(row: dict, email: str | None) -> Driver:
    """Valida usuario activo, rol Chofer y conductor enlazado. 403 si no."""
    if not row.get("is_active"):
        raise HttpError(403, "Tu usuario está desactivado.", code="inactive_user")
    if row.get("role_name") != config.driver_role_name() or row.get("driver_id") is None:
        raise HttpError(403, "Tu usuario no es un chofer o no está enlazado a un conductor.", code="not_a_driver")
    if row.get("organization_id") is None:
        raise HttpError(403, "Tu usuario no pertenece a una organización.", code="no_organization")
    return Driver(str(row["app_user_id"]), str(row["auth_user_id"]), str(row["organization_id"]),
                  str(row["driver_id"]), email, row.get("driver_name") or row.get("full_name"))


# Contexto del chofer por contenedor Lambda: ahorra 1 consulta por request (los lotes GPS, las paradas y mi-viaje
# del mismo chofer suelen caer en el mismo contenedor). Desactivar un usuario o desenlazar su conductor tarda
# como máximo CONTEXT_TTL_SECONDS en cortar el acceso; login y refresh siempre van a la BD.
CONTEXT_TTL_SECONDS = 60
CONTEXT_CACHE_MAX = 500
_contexts: dict[str, tuple[float, dict]] = {}


def _context_row(auth_user_id: str, cached: bool) -> dict | None:
    at = time.monotonic()
    hit = _contexts.get(auth_user_id) if cached else None
    if hit and at - hit[0] < CONTEXT_TTL_SECONDS:
        return hit[1]
    rows = db.query(sql.DRIVER_CONTEXT_SQL, [auth_user_id])
    if not rows:
        _contexts.pop(auth_user_id, None)
        return None
    if len(_contexts) >= CONTEXT_CACHE_MAX:
        _contexts.clear()
    _contexts[auth_user_id] = (at, rows[0])
    return rows[0]


def _context_for(auth_user_id: str, email: str | None, cached: bool = False) -> Driver:
    row = _context_row(auth_user_id, cached)
    if row is None:
        raise HttpError(401, "No existe el usuario de este token.", code="invalid_token")
    return _driver_from_row(row, email)


def authenticate(event: dict) -> Driver:
    """Usuario del header Authorization: Bearer. 401 `token_expired` si venció (la app debe refrescar)."""
    value = headers(event).get("authorization", "")
    if not value.lower().startswith("bearer ") or not value[7:].strip():
        raise HttpError(401, "Falta el token.", code="no_token")
    try:
        claims = security.verify_access(value[7:].strip(), config.jwt_secret())
    except jwt.ExpiredSignatureError:
        raise HttpError(401, "La sesión venció.", code="token_expired") from None
    except jwt.InvalidTokenError:
        raise HttpError(401, "Token inválido.", code="invalid_token") from None
    return _context_for(claims["id"], claims["email"], cached=True)


def _session(driver: Driver, device_id: str | None) -> dict:
    refresh = security.new_refresh_token()
    db.query(sql.INSERT_REFRESH_SQL, [driver.app_user_id, security.hash_refresh(refresh), device_id,
                                      security.REFRESH_TTL_SECONDS])
    access = security.sign_access(driver.auth_user_id, driver.email, config.jwt_secret())
    return {"access_token": access, "refresh_token": refresh, "token_type": "bearer",
            "expires_in": security.ACCESS_TTL_SECONDS,
            "user": {"id": driver.auth_user_id, "email": driver.email},
            "driver": {"id": driver.driver_id, "name": driver.full_name}}


def _device_id(body: dict) -> str | None:
    value = body.get("device_id")
    return value[:100] if isinstance(value, str) and value else None


def login(event: dict, _driver=None) -> dict:
    route = "POST /api/mobile/v1/auth/login"
    body = body_dict(event)
    email, password = body.get("email"), body.get("password")
    if not isinstance(email, str) or not isinstance(password, str) or not email or not password:
        raise HttpError(400, "email y password son requeridos")
    email = email.strip().lower()
    # Freno de fuerza bruta por correo: tras MAX_LOGIN_FAILURES fallos en la ventana, ni se mira la clave.
    failures = db.query(sql.RECENT_LOGIN_FAILURES_SQL, [email, LOGIN_WINDOW_SECONDS])[0]["n"]
    ip = audit.request_info(event)[1]
    ip_failures = db.query(sql.RECENT_LOGIN_FAILURES_BY_IP_SQL, [ip, LOGIN_WINDOW_SECONDS])[0]["n"] if ip else 0
    if int(failures) >= MAX_LOGIN_FAILURES or int(ip_failures) >= MAX_LOGIN_FAILURES_PER_IP:
        audit.record(event, route, "login_throttled", email=email)
        raise HttpError(429, "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.",
                        code="too_many_attempts")
    rows = db.query(sql.LOGIN_SQL, [email])
    credential = rows[0] if rows else None
    if not credential or not security.verify_password(password, credential["password_hash"]):
        audit.record(event, route, "login_failed", email=email, metadata={"reason": "invalid_credentials"})
        raise HttpError(401, "Correo o contraseña incorrectos.", code="invalid_credentials")
    auth_user_id = str(credential["auth_user_id"])
    try:
        driver = _context_for(auth_user_id, credential["email"])
    except HttpError as err:
        audit.record(event, route, "login_blocked", email=email, auth_user_id=auth_user_id,
                     metadata={"reason": err.code})
        raise
    audit.record(event, route, "login", email=credential["email"], auth_user_id=auth_user_id)
    device_id = _device_id(body)
    presence.mark(driver, "online", "login", presence.now(), device_id)
    return ok(_session(driver, device_id))


def refresh(event: dict, _driver=None) -> dict:
    """Canjea un refresh token por uno nuevo (rotación). Reusar uno ya canjeado = robo: se revocan todos."""
    route = "POST /api/mobile/v1/auth/refresh"
    body = body_dict(event)
    token = body.get("refresh_token")
    if not isinstance(token, str) or not token:
        raise HttpError(400, "refresh_token es requerido")
    rows = db.query(sql.REFRESH_BY_HASH_SQL, [security.hash_refresh(token)])
    if not rows:
        raise HttpError(401, "Sesión inválida.", code="invalid_refresh")
    row = rows[0]
    at = datetime.now(timezone.utc)
    reused = row["revoked_at"] is not None
    if reused and (at - aware(row["revoked_at"])).total_seconds() > REFRESH_REUSE_GRACE_SECONDS:
        db.query(sql.REVOKE_ALL_REFRESH_SQL, [row["app_user_id"]])
        audit.record(event, route, "refresh_reuse_detected", auth_user_id=str(row["auth_user_id"]))
        raise HttpError(401, "Sesión inválida.", code="invalid_refresh")
    if aware(row["expires_at"]) <= at:
        raise HttpError(401, "La sesión venció.", code="invalid_refresh")
    driver = _context_for(str(row["auth_user_id"]), row["email"])
    if reused:
        audit.record(event, route, "refresh_retry_grace", auth_user_id=str(row["auth_user_id"]))
    else:
        db.query(sql.REVOKE_REFRESH_SQL, [row["id"]])
    return ok(_session(driver, _device_id(body)))


def logout(event: dict, _driver=None) -> dict:
    """Revoca el refresh token del dispositivo y marca al chofer offline. Idempotente: un token desconocido no es error.

    `occurred_at` es la hora del logout en el teléfono: un logout hecho sin red se reenvía después y no pisa un
    login posterior."""
    body = body_dict(event)
    token = body.get("refresh_token")
    if isinstance(token, str) and token:
        rows = db.query(sql.REFRESH_BY_HASH_SQL, [security.hash_refresh(token)])
        if rows:
            db.query(sql.REVOKE_REFRESH_SQL, [rows[0]["id"]])
            presence.mark_offline(str(rows[0]["app_user_id"]), presence.event_time(body.get("occurred_at"),
                                  presence.now()), _device_id(body))
    return ok({"ok": True})
