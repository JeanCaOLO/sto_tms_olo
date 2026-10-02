"""Lambda authorizer (HTTP API, payload 2.0, respuestas simples).

Valida `Authorization: Bearer <jwt>` y deja { sub, email } en
requestContext.authorizer.lambda para las Lambdas de cada módulo.
Reemplaza el middleware requireAuth de server/tms-auth.mjs.
"""

import logging

import jwt

from tms_common.config import jwt_secret
from tms_common.tokens import verify_token

logger = logging.getLogger()
logger.setLevel(logging.INFO)

BEARER_PREFIX = "Bearer "


def _bearer_token(event: dict) -> str | None:
    header = (event.get("headers") or {}).get("authorization") or ""
    return header[len(BEARER_PREFIX):] if header.startswith(BEARER_PREFIX) else None


def handler(event: dict, _context: object) -> dict:
    token = _bearer_token(event)
    if not token:
        return {"isAuthorized": False}
    try:
        user = verify_token(token, jwt_secret())
    except jwt.InvalidTokenError as err:
        logger.info("Token rechazado: %s", err)
        return {"isAuthorized": False}
    return {"isAuthorized": True, "context": {"sub": user["id"], "email": user["email"] or ""}}
