"""Port: persistencia de credenciales de autenticación (auth_credentials + app_users)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class Credential:
    """Credencial almacenada + estado del app_user asociado (para el login)."""

    auth_user_id: str
    email: str
    password_hash: str
    is_active: bool | None


class CredencialRepo(Protocol):
    """Lee y crea credenciales. La verificación del hash y la firma del token
    NO viven aquí (dominio/servicio); el repo solo persiste."""

    def por_email(self, email: str) -> Credential | None:
        """Credencial por email (con is_active del app_user), o None."""
        ...

    def existe_email(self, email: str) -> bool:
        """True si ya hay una credencial con ese email."""
        ...

    def crear(self, auth_user_id: str, email: str, password_hash: str) -> None:
        """Inserta una credencial nueva (solo la credencial; el app_user lo crea
        el flujo de administración, igual que supabase.auth.signUp)."""
        ...
