"""Tokens y contraseñas de la app móvil.

- Acceso: JWT HS256 de vida corta (1 h), firmado con un secreto PROPIO (`iss` = tms-mobile, `typ` = access).
- Refresh: token opaco aleatorio de vida larga; en la BD solo se guarda su hash SHA-256 (rotación en cada uso).
- Contraseñas: bcrypt compatible con los hashes del TMS ($2a$/$2b$) en `auth_credentials`.
"""

import hashlib
import secrets
import time

import jwt

ACCESS_TTL_SECONDS = 60 * 60
REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60
ALGORITHM = "HS256"
ISSUER = "tms-mobile"


def sign_access(auth_user_id: str, email: str | None, secret: str, now: int | None = None) -> str:
    issued = int(now if now is not None else time.time())
    claims = {"sub": auth_user_id, "email": email, "iss": ISSUER, "typ": "access",
              "iat": issued, "exp": issued + ACCESS_TTL_SECONDS}
    return jwt.encode(claims, secret, algorithm=ALGORITHM)


def verify_access(token: str, secret: str) -> dict:
    """Lanza jwt.ExpiredSignatureError (vencido) o jwt.InvalidTokenError (inválido)."""
    payload = jwt.decode(token, secret, algorithms=[ALGORITHM], issuer=ISSUER,
                         options={"require": ["sub", "exp", "iss"]})
    if payload.get("typ") != "access":
        raise jwt.InvalidTokenError("tipo de token inválido")
    return {"id": payload["sub"], "email": payload.get("email")}


def new_refresh_token() -> str:
    return secrets.token_urlsafe(48)


def hash_refresh(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def verify_password(password: str, password_hash: str) -> bool:
    import bcrypt  # binario nativo: se instala por stack (requirements.txt) y se construye con sam build --use-container

    try:
        return bcrypt.checkpw(password.encode(), password_hash.encode())
    except ValueError:
        return False
