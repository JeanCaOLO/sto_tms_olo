"""Validación de los payloads de usuario y rol que manda Configuración."""

import re
from dataclasses import dataclass

from tms_common.errors import HttpError
from tms_common.passwords import MIN_PASSWORD_LENGTH

EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
STATUSES = ("active", "inactive")
SCOPE_KEYS = ("country_id", "warehouse_id", "customer_id")


@dataclass(frozen=True)
class ScopeInput:
    """Un scope con los tres campos en None es GLOBAL."""
    country_id: str | None = None
    warehouse_id: str | None = None
    customer_id: str | None = None


def required_text(body: dict, key: str, label: str) -> str:
    value = str(body.get(key) or "").strip()
    if not value:
        raise HttpError(400, f"{label} es obligatorio")
    return value


def email(body: dict) -> str:
    value = required_text(body, "email", "El correo").lower()
    if not EMAIL.match(value):
        raise HttpError(400, "El correo no es válido")
    return value


def password(body: dict) -> str:
    value = str(body.get("password") or "")
    if len(value) < MIN_PASSWORD_LENGTH:
        raise HttpError(400, f"La contraseña debe tener al menos {MIN_PASSWORD_LENGTH} caracteres")
    return value


def status(body: dict, default: str = "active") -> str:
    value = body.get("status") or default
    if value not in STATUSES:
        raise HttpError(400, "Estado inválido (active | inactive)")
    return value


def _scope(raw: object) -> ScopeInput:
    if not isinstance(raw, dict):
        raise HttpError(400, "Cada alcance debe ser un objeto")
    return ScopeInput(**{key: (str(raw[key]) if raw.get(key) else None) for key in SCOPE_KEYS})


def scopes(body: dict) -> list[ScopeInput]:
    raw = body.get("scopes")
    if not isinstance(raw, list) or not raw:
        raise HttpError(400, "El usuario necesita al menos un alcance (Global o país/almacén/cliente)")
    return list(dict.fromkeys(_scope(item) for item in raw))
