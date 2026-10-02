"""JWT de sesión. Compatible con los tokens que firmaba server/tms-auth.mjs
(jsonwebtoken, HS256, claims sub + email, 7 días): con el mismo secreto, las
sesiones existentes siguen siendo válidas tras la migración."""

import time

import jwt

TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60
ALGORITHM = "HS256"


def sign_session(user_id: str, email: str, secret: str) -> dict:
    now = int(time.time())
    claims = {"sub": user_id, "email": email, "iat": now, "exp": now + TOKEN_TTL_SECONDS}
    token = jwt.encode(claims, secret, algorithm=ALGORITHM)
    return {"access_token": token, "token_type": "bearer", "user": {"id": user_id, "email": email}}


def verify_token(token: str, secret: str) -> dict:
    """Lanza jwt.InvalidTokenError si el token no es válido o expiró."""
    payload = jwt.decode(token, secret, algorithms=[ALGORITHM], options={"require": ["sub", "exp"]})
    return {"id": payload["sub"], "email": payload.get("email")}
