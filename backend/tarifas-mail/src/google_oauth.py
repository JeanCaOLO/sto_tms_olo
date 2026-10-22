"""OAuth 2.0 de Google para enviar correo con Gmail desde la cuenta del usuario.

Alcance mínimo: `gmail.send` (solo enviar, no puede leer el buzón) + el correo de la cuenta. Se pide
`access_type=offline` y `prompt=consent` para recibir un refresh token, que es lo que se guarda: con él el
envío sale con un solo botón, sin volver a iniciar sesión.

`state` va firmado (HMAC con el secreto del cliente) y con vencimiento: el callback de Google llega sin
sesión del TMS, y así sabe a qué usuario pertenece el código sin confiar en nada del navegador.
"""

import base64
import hashlib
import hmac
import json
import secrets
import time
from urllib.parse import urlencode

import http_util

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"
SCOPES = ("https://www.googleapis.com/auth/gmail.send", "openid", "email")
STATE_TTL_SECONDS = 600


class OAuthError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def _signature(payload: str, key: str) -> str:
    return _b64(hmac.new(key.encode("utf-8"), payload.encode("ascii"), hashlib.sha256).digest())


def sign_state(user_id: str, key: str, now: float | None = None) -> str:
    body = {"u": user_id, "exp": int((now if now is not None else time.time()) + STATE_TTL_SECONDS), "n": secrets.token_hex(8)}
    payload = _b64(json.dumps(body, separators=(",", ":")).encode("utf-8"))
    return f"{payload}.{_signature(payload, key)}"


def verify_state(state: str, key: str, now: float | None = None) -> str:
    """Devuelve el usuario al que pertenece el `state`, o lanza OAuthError 400."""
    payload, _, signature = (state or "").partition(".")
    if not payload or not hmac.compare_digest(signature, _signature(payload, key)):
        raise OAuthError(400, "La conexión con Google no es válida. Vuelve a intentarlo desde el TMS.")
    try:
        body = json.loads(_unb64(payload))
    except (ValueError, UnicodeDecodeError) as err:
        raise OAuthError(400, "La conexión con Google no es válida.") from err
    if body.get("exp", 0) < (now if now is not None else time.time()):
        raise OAuthError(400, "La conexión con Google venció. Vuelve a intentarlo desde el TMS.")
    return str(body["u"])


def build_auth_url(client: dict, redirect_uri: str, state: str) -> str:
    params = {
        "client_id": client["client_id"], "redirect_uri": redirect_uri, "response_type": "code",
        "scope": " ".join(SCOPES), "access_type": "offline", "prompt": "consent",
        "include_granted_scopes": "true", "state": state,
    }
    return f"{AUTH_URL}?{urlencode(params)}"


def exchange_code(client: dict, redirect_uri: str, code: str) -> dict:
    """Cambia el código por tokens y devuelve `{refresh_token, email}`."""
    try:
        tokens = http_util.post_form(TOKEN_URL, {
            "code": code, "client_id": client["client_id"], "client_secret": client["client_secret"],
            "redirect_uri": redirect_uri, "grant_type": "authorization_code"})
        refresh = tokens.get("refresh_token")
        if not refresh:
            raise OAuthError(400, "Google no entregó permiso de uso continuo. Quita el acceso del TMS en tu cuenta de Google y conecta de nuevo.")
        info = http_util.get_json(USERINFO_URL, tokens["access_token"])
    except http_util.UpstreamError as err:
        raise OAuthError(502, str(err)) from err
    return {"refresh_token": refresh, "email": info.get("email", "")}


def refresh_access_token(client: dict, refresh_token: str) -> str:
    try:
        tokens = http_util.post_form(TOKEN_URL, {
            "refresh_token": refresh_token, "client_id": client["client_id"],
            "client_secret": client["client_secret"], "grant_type": "refresh_token"})
    except http_util.UpstreamError as err:
        if err.status in (400, 401):
            raise OAuthError(409, "La conexión con Google se perdió o fue revocada. Vuelve a conectar tu cuenta.") from err
        raise OAuthError(502, str(err)) from err
    return tokens["access_token"]
