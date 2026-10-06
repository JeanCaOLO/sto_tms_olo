"""Reglas puras de validación de los payloads de usuario y rol (Configuración).

Portado de `origin/main:backend/admin/src/admin_payload.py`. No conoce HTTP ni
SQL: lanza `DatosInvalidos` y el adaptador inbound lo mapea a HttpError 400.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from lib.tms_common.passwords import MIN_PASSWORD_LENGTH

EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
STATUSES = ("active", "inactive")
SCOPE_KEYS = ("country_id", "warehouse_id", "customer_id")


class DatosInvalidos(Exception):
    """Payload inválido (falta un campo, correo mal formado, etc.)."""


@dataclass(frozen=True)
class ScopeInput:
    """Un scope con los tres campos en None es GLOBAL."""

    country_id: str | None = None
    warehouse_id: str | None = None
    customer_id: str | None = None


def required_text(body: dict, key: str, label: str) -> str:
    value = str(body.get(key) or "").strip()
    if not value:
        raise DatosInvalidos(f"{label} es obligatorio")
    return value


def email(body: dict) -> str:
    value = required_text(body, "email", "El correo").lower()
    if not EMAIL.match(value):
        raise DatosInvalidos("El correo no es válido")
    return value


def password(body: dict) -> str:
    value = str(body.get("password") or "")
    if len(value) < MIN_PASSWORD_LENGTH:
        raise DatosInvalidos(f"La contraseña debe tener al menos {MIN_PASSWORD_LENGTH} caracteres")
    return value


def status(body: dict, default: str = "active") -> str:
    value = body.get("status") or default
    if value not in STATUSES:
        raise DatosInvalidos("Estado inválido (active | inactive)")
    return value


def _scope(raw: object) -> ScopeInput:
    if not isinstance(raw, dict):
        raise DatosInvalidos("Cada alcance debe ser un objeto")
    return ScopeInput(**{key: (str(raw[key]) if raw.get(key) else None) for key in SCOPE_KEYS})


def scopes(body: dict) -> list[ScopeInput]:
    raw = body.get("scopes")
    if not isinstance(raw, list) or not raw:
        raise DatosInvalidos("El usuario necesita al menos un alcance (Global o país/almacén/cliente)")
    return list(dict.fromkeys(_scope(item) for item in raw))
