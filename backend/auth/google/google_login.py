"""POST /api/auth/google — entrar con Google (pública, sin authorizer).

Va FUERA de la VPC: tiene que llegar a Google para validar el ID token, y la VPC de Aurora
no tiene NAT. No ve Aurora: con el correo ya verificado invoca a la Lambda de auth (que sí
está en la VPC), igual que `tarifas-mail` hace con `tarifas`. Esa Lambda busca o crea el
usuario y firma la sesión del TMS.

Solo entran correos de ALLOWED_DOMAINS (ologistics.com, intelix.biz). La Lambda de auth lo
vuelve a comprobar.
"""

import json
import logging
import os
import urllib.error
import urllib.parse
import urllib.request

import boto3

log = logging.getLogger()
log.setLevel(logging.INFO)

TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo?id_token="
ISSUERS = {"accounts.google.com", "https://accounts.google.com"}
DOMAIN_MESSAGE = "Solo pueden iniciar sesión cuentas de @ologistics.com o @intelix.biz. Entra con tu correo corporativo."


class LoginError(Exception):
    def __init__(self, status: int, code: str, message: str):
        super().__init__(message)
        self.status, self.code, self.message = status, code, message


def allowed_domains() -> set[str]:
    return {d.strip().lower() for d in os.environ.get("ALLOWED_DOMAINS", "ologistics.com,intelix.biz").split(",") if d.strip()}


def email_allowed(email: str) -> bool:
    return "@" in email and email.rsplit("@", 1)[1].lower() in allowed_domains()


def _tokeninfo(credential: str) -> dict:
    """Google valida firma y vencimiento del ID token y devuelve sus claims."""
    try:
        with urllib.request.urlopen(TOKENINFO_URL + urllib.parse.quote(credential), timeout=8) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as err:
        raise LoginError(401, "invalid_google_token", "Google no validó el inicio de sesión. Intenta de nuevo.") from err
    except (urllib.error.URLError, TimeoutError) as err:
        raise LoginError(502, "google_unreachable", "No se pudo contactar a Google. Intenta de nuevo.") from err


def verify(credential: str, client_id: str, tokeninfo=_tokeninfo) -> dict:
    """Claims del ID token si es nuestro, vigente, con correo verificado y de un dominio permitido."""
    if not credential:
        raise LoginError(400, "missing_credential", "Falta la credencial de Google.")
    claims = tokeninfo(credential)
    if claims.get("aud") != client_id or claims.get("iss") not in ISSUERS:
        raise LoginError(401, "invalid_google_token", "El inicio de sesión de Google no es para esta aplicación.")
    email = str(claims.get("email") or "").lower()
    if str(claims.get("email_verified")).lower() != "true":
        raise LoginError(401, "email_not_verified", "Tu correo de Google no está verificado.")
    if not email_allowed(email):
        raise LoginError(403, "domain_not_allowed", DOMAIN_MESSAGE)
    return {"email": email, "name": claims.get("name") or email}


def _json(status: int, body: dict) -> dict:
    return {"statusCode": status, "headers": {"Content-Type": "application/json"}, "body": json.dumps(body)}


def handler(event, _context=None):
    try:
        body = json.loads(event.get("body") or "{}")
        user = verify(str(body.get("credential") or ""), os.environ["GOOGLE_CLIENT_ID"])
        request = {"action": "google_login", **user}
        response = boto3.client("lambda").invoke(FunctionName=os.environ["AUTH_FUNCTION"], Payload=json.dumps(request).encode())
        result = json.loads(response["Payload"].read())
        if response.get("FunctionError"):
            log.error("La Lambda de auth falló: %s", result)
            raise LoginError(502, "auth_unavailable", "No se pudo iniciar sesión. Intenta de nuevo.")
        return _json(int(result.get("status", 500)), result.get("body") or {})
    except LoginError as err:
        log.warning("Login con Google rechazado: %s", err.code)
        return _json(err.status, {"error": err.code, "message": err.message})
    except json.JSONDecodeError:
        return _json(400, {"error": "bad_request", "message": "Cuerpo inválido."})
