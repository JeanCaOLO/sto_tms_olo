"""Autenticación: /api/auth/* . Portado de server/tms-auth.mjs.

`login` es la única ruta pública; el resto pasa por el Lambda authorizer.
Los hashes existentes de bcryptjs ($2a$) son compatibles con `bcrypt`.
"""

from uuid import uuid4

from tms_common import audit, pg
from tms_common.config import jwt_secret
from tms_common.errors import HttpError
from tms_common.event import auth_user, json_body
from tms_common.handler import tms_handler
from tms_common.passwords import hash_password, verify_password
from tms_common.responses import empty_response, json_response
from tms_common.tokens import sign_session

MIN_PASSWORD_LENGTH = 6  # contrato heredado de /auth/signup; la administración exige 8

LOGIN_SQL = """
SELECT c.auth_user_id, c.email, c.password_hash, u.is_active
FROM auth_credentials c LEFT JOIN app_users u ON u.auth_user_id = c.auth_user_id
WHERE c.email = %s
"""


def _credentials(event: dict) -> tuple[str, str]:
    body = json_body(event)
    email = body.get("email") if isinstance(body, dict) else None
    password = body.get("password") if isinstance(body, dict) else None
    if not email or not password:
        raise HttpError(400, "email y password son requeridos")
    return str(email).lower(), str(password)


def login(event: dict) -> dict:
    email, password = _credentials(event)
    rows = pg.query(LOGIN_SQL, [email])
    credential = rows[0] if rows else None
    if not credential or not verify_password(password, credential["password_hash"]):
        audit.record(event, "login_failed", email=email, actor_type="anonymous",
                     metadata={"reason": "invalid_credentials"})
        body = {"error": "invalid_credentials", "message": "Correo o contraseña incorrectos."}
        return json_response(401, body)
    user_id = str(credential["auth_user_id"])
    if credential.get("is_active") is False:
        audit.record(event, "login_blocked", email=email, auth_user_id=user_id, metadata={"reason": "inactive_user"})
        return json_response(403, {"error": "inactive_user", "message": "Tu usuario está desactivado."})
    session = sign_session(user_id, credential["email"], jwt_secret())
    audit.record(event, "login", email=credential["email"], auth_user_id=user_id)
    return json_response(200, {"data": session, "error": None})


def sign_up(event: dict) -> dict:
    """Equivalente a supabase.auth.signUp: crea solo la credencial; el app_user
    lo crea el llamador (flujo de UserModal)."""
    email, password = _credentials(event)
    if len(password) < MIN_PASSWORD_LENGTH:
        raise HttpError(400, f"La contraseña debe tener al menos {MIN_PASSWORD_LENGTH} caracteres")
    if pg.query("SELECT 1 FROM auth_credentials WHERE email = %s", [email]):
        body = {"error": "email_exists", "message": "Ya existe un usuario con ese correo."}
        return json_response(409, body)
    user_id = str(uuid4())
    password_hash = hash_password(password)
    pg.query(
        "INSERT INTO auth_credentials (auth_user_id, email, password_hash) VALUES (%s, %s, %s)",
        [user_id, email, password_hash],
    )
    return json_response(200, {"data": {"user": {"id": user_id, "email": email}}, "error": None})


def session(event: dict) -> dict:
    return json_response(200, {"data": {"user": auth_user(event)}, "error": None})


def sign_out(event: dict) -> dict:
    if audit.actor(event)["auth_user_id"]:
        audit.record(event, "logout")
    return empty_response(204)


ROUTES = {
    "POST /api/auth/login": login,
    "POST /api/auth/signup": sign_up,
    "GET /api/auth/session": session,
    "POST /api/auth/logout": sign_out,
}

handler = tms_handler(ROUTES)
