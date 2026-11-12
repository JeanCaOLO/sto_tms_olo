"""Envío de proformas por Gmail desde la cuenta de Google del usuario (Lambda FUERA de la VPC).

Rutas (prefijo /api/tarifas-mail):
  GET    /google/status              ¿el usuario ya conectó su cuenta de Google? ¿cuál?
  POST   /google/start               devuelve la URL de Google para conectar la cuenta
  GET    /google/callback            Google vuelve aquí (SIN sesión del TMS: la identidad va en `state` firmado)
  DELETE /google                     desconecta (borra el token guardado)
  POST   /proformas/{id}/send        envía la proforma aprobada: { to[], subject, body, pdfBase64, fileName }

Esta Lambda no ve Aurora (la VPC no tiene NAT): para saber si el usuario PUEDE enviar y si la proforma
está aprobada invoca la Lambda de tarifas (que sí está en la VPC), igual que `alerts` hace con `digest`.
El navegador marca después la proforma como enviada con la API normal de tarifas.
"""

import json
import logging
import os
from urllib.parse import urlencode

import gmail_send
import google_oauth
import token_store

log = logging.getLogger()
log.setLevel(logging.INFO)

_client_cache: dict = {}


def _aws(service: str):
    import boto3  # en Lambda siempre está; se importa aquí para poder probar sin AWS
    return boto3.client(service)


def _response(status: int, body: object = None, headers: dict | None = None) -> dict:
    return {"statusCode": status, "headers": {"Content-Type": "application/json", **(headers or {})},
            "body": json.dumps(body) if body is not None else ""}


def _error(status: int, message: str) -> dict:
    return _response(status, {"data": None, "error": {"message": message}})


def _ok(data: object) -> dict:
    return _response(200, {"data": data, "error": None})


def is_local() -> bool:
    """Desarrollo local (`backend/local/serve.py`): el cliente OAuth viene de GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET
    (.env.local) y no hay AWS. En AWS esas variables no existen y se usa Secrets Manager."""
    return bool(os.environ.get("GOOGLE_CLIENT_ID"))


def redirect_uri() -> str:
    default = "http://localhost:3000/api/tarifas-mail/google/callback" if is_local() else ""
    return os.environ.get("GOOGLE_REDIRECT_URI") or default


def google_client() -> dict:
    """Credenciales del cliente OAuth (secreto del propio stack). Se leen una vez por contenedor."""
    if is_local():
        return {"client_id": os.environ["GOOGLE_CLIENT_ID"], "client_secret": os.environ.get("GOOGLE_CLIENT_SECRET", "")}
    if "value" not in _client_cache:
        raw = _aws("secretsmanager").get_secret_value(SecretId=os.environ["GOOGLE_OAUTH_SECRET_NAME"])
        value = json.loads(raw["SecretString"])
        if not value.get("client_id") or value["client_id"] == "CAMBIAR":
            raise google_oauth.OAuthError(503, "La integración con Google aún no está configurada (client_id).")
        _client_cache["value"] = value
    return _client_cache["value"]


def _user_id(event: dict) -> str:
    claims = ((event.get("requestContext") or {}).get("authorizer") or {}).get("lambda") or {}
    if not claims.get("sub"):
        raise google_oauth.OAuthError(401, "Sesión no válida.")
    return str(claims["sub"])


def _app_url(path: str, **query: str) -> str:
    base = (os.environ.get("APP_URL") or ("http://localhost:3000" if is_local() else "")).rstrip("/")
    return f"{base}{path}" + (f"?{urlencode(query)}" if query else "")


# ── Conexión con Google ────────────────────────────────────────────────────────────────────────

def status(event: dict) -> dict:
    connection = token_store.get_connection(_user_id(event))
    return _ok({"connected": bool(connection), "email": (connection or {}).get("email")})


def start(event: dict) -> dict:
    client = google_client()
    state = google_oauth.sign_state(_user_id(event), client["client_secret"])
    return _ok({"url": google_oauth.build_auth_url(client, redirect_uri(), state)})


def callback(event: dict) -> dict:
    """Vuelta de Google. Siempre redirige al TMS, con el resultado en la URL."""
    query = event.get("queryStringParameters") or {}
    try:
        if query.get("error"):
            raise google_oauth.OAuthError(400, "No se concedió el permiso de Google.")
        client = google_client()
        user_id = google_oauth.verify_state(query.get("state", ""), client["client_secret"])
        connection = google_oauth.exchange_code(client, redirect_uri(), query.get("code", ""))
        token_store.save_connection(user_id, connection)
        target = _app_url("/proformas", google="connected")
    except google_oauth.OAuthError as err:
        log.warning("Callback de Google rechazado: %s", err)
        target = _app_url("/proformas", google="error", reason=str(err)[:200])
    return {"statusCode": 302, "headers": {"Location": target}, "body": ""}


def disconnect(event: dict) -> dict:
    token_store.delete_connection(_user_id(event))
    return _ok({"connected": False})


# ── Envío ──────────────────────────────────────────────────────────────────────────────────────

def authorize_send(user_id: str, proforma_id: str) -> None:
    """Pregunta a la Lambda de tarifas (en la VPC) si este usuario puede enviar esta proforma."""
    request = {"action": "authorize_send", "user_id": user_id, "proforma_id": proforma_id}
    if is_local() and not os.environ.get("TARIFAS_FUNCTION"):
        import proformas_api  # servidor local: misma verificación, en proceso, sin invocar una Lambda
        payload = proformas_api.authorize_send(request)
    else:
        response = _aws("lambda").invoke(FunctionName=os.environ["TARIFAS_FUNCTION"], Payload=json.dumps(request).encode("utf-8"))
        payload = json.loads(response["Payload"].read())
        if response.get("FunctionError"):
            raise gmail_send.MailError(502, "No se pudo verificar el permiso de envío.")
    if not payload.get("ok"):
        raise gmail_send.MailError(int(payload.get("status", 403)), payload.get("message", "No puedes enviar esta proforma."))


def send_proforma(event: dict) -> dict:
    user_id = _user_id(event)
    proforma_id = (event.get("pathParameters") or {}).get("id", "")
    body = json.loads(event.get("body") or "{}")
    to = gmail_send.clean_recipients(body.get("to"))
    pdf = gmail_send.decode_pdf(body.get("pdfBase64"))
    authorize_send(user_id, proforma_id)

    connection = token_store.get_connection(user_id)
    if not connection:
        return _error(409, "Conecta tu cuenta de Google para enviar directo.")
    access_token = google_oauth.refresh_access_token(google_client(), connection["refresh_token"])
    raw = gmail_send.build_message(connection.get("email", ""), to, str(body.get("subject") or ""),
                                   str(body.get("body") or ""), pdf, str(body.get("fileName") or "proforma.pdf"))
    message_id = gmail_send.send(access_token, raw)
    log.info("Proforma %s enviada por %s a %s (Gmail %s)", proforma_id, user_id, to, message_id)
    return _ok({"sent": True, "messageId": message_id, "from": connection.get("email"), "to": to})


ROUTES = {
    "GET /api/tarifas-mail/google/status": status,
    "POST /api/tarifas-mail/google/start": start,
    "GET /api/tarifas-mail/google/callback": callback,
    "DELETE /api/tarifas-mail/google": disconnect,
    "POST /api/tarifas-mail/proformas/{id}/send": send_proforma,
}


def handler(event: dict, context: object) -> dict:
    route = ROUTES.get(event.get("routeKey", ""))
    if route is None:
        return _error(404, "Ruta no encontrada.")
    try:
        return route(event)
    except (google_oauth.OAuthError, gmail_send.MailError) as err:
        return _error(err.status, str(err))
    except json.JSONDecodeError:
        return _error(400, "El cuerpo debe ser JSON.")
    except ValueError as err:
        return _error(400, str(err))
