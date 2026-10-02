"""Reglas de negocio de autenticación (puras).

- Normalización/validación de credenciales de entrada (email + password).
- Longitud mínima de contraseña para el alta (contrato heredado de /auth/signup).

Las excepciones de dominio las traduce el adaptador inbound a HttpError; el
dominio no conoce códigos HTTP.
"""

from __future__ import annotations

from dataclasses import dataclass

# Contrato heredado de /auth/signup: 6. La administración exige 8 (passwords.MIN_PASSWORD_LENGTH).
MIN_PASSWORD_LENGTH = 6


class CredencialesInvalidas(Exception):
    """Faltan email o password en la petición."""


class PasswordDebil(Exception):
    def __init__(self, minimo: int):
        super().__init__(f"La contraseña debe tener al menos {minimo} caracteres")
        self.minimo = minimo


@dataclass(frozen=True)
class Credenciales:
    """Par email/password ya normalizado (email en minúsculas)."""

    email: str
    password: str


def parse_credenciales(email: object, password: object) -> Credenciales:
    """Valida y normaliza el par email/password que llega del cliente."""
    if not email or not password:
        raise CredencialesInvalidas("email y password son requeridos")
    return Credenciales(email=str(email).lower(), password=str(password))


def validar_password_alta(password: str) -> None:
    """Regla de alta (signup): longitud mínima."""
    if len(password) < MIN_PASSWORD_LENGTH:
        raise PasswordDebil(MIN_PASSWORD_LENGTH)
