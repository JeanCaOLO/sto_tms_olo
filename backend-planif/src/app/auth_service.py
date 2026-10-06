"""Casos de uso de autenticación (login, signup, session, logout).

Orquesta el dominio (validación de credenciales) con el port de persistencia y
los helpers de infraestructura (passwords, tokens). No conoce HTTP ni SQL: cada
caso devuelve un resultado y el adaptador inbound lo mapea a la respuesta.
"""

from __future__ import annotations

from dataclasses import dataclass
from uuid import uuid4

from domain.auth.credenciales import Credenciales, validar_password_alta
from ports.credencial_repo import CredencialRepo
from lib.tms_common.passwords import hash_password, verify_password
from lib.tms_common.tokens import sign_session


class CredencialesIncorrectas(Exception):
    """Email o contraseña no coinciden con ninguna credencial activa."""


class UsuarioInactivo(Exception):
    """La credencial existe pero el app_user está desactivado."""


class EmailYaExiste(Exception):
    """Ya hay una credencial registrada con ese email."""


@dataclass(frozen=True)
class NuevoUsuario:
    id: str
    email: str


class AuthService:
    def __init__(self, credenciales: CredencialRepo, jwt_secret: str) -> None:
        self._credenciales = credenciales
        self._jwt_secret = jwt_secret

    # POST /api/auth/login → sesión firmada (JWT) o error de credenciales/estado.
    def login(self, creds: Credenciales) -> dict:
        credential = self._credenciales.por_email(creds.email)
        if credential is None or not verify_password(creds.password, credential.password_hash):
            raise CredencialesIncorrectas()
        if credential.is_active is False:
            raise UsuarioInactivo()
        return sign_session(credential.auth_user_id, credential.email, self._jwt_secret)

    # POST /api/auth/signup → crea SOLO la credencial (el app_user lo crea el
    # flujo de administración, igual que supabase.auth.signUp).
    def sign_up(self, creds: Credenciales) -> NuevoUsuario:
        validar_password_alta(creds.password)
        if self._credenciales.existe_email(creds.email):
            raise EmailYaExiste()
        user_id = str(uuid4())
        self._credenciales.crear(user_id, creds.email, hash_password(creds.password))
        return NuevoUsuario(id=user_id, email=creds.email)
