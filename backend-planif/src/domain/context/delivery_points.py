"""Reglas puras de un punto de entrega (validación de entrada, sin I/O ni SQL).

Portado de la parte NO-SQL de `origin/main:backend/context/src/delivery_points.py`:
campos obligatorios, rango de coordenadas y el estado de geocodificación que se
deriva de si vienen coordenadas. Las excepciones las traduce el adaptador
inbound a HttpError.
"""

from __future__ import annotations

from dataclasses import dataclass

ADDRESS_FIELDS = ("line1", "line2", "city", "state")
POINT_FIELDS = ("name", "delivery_instructions", "zone_id", "route_code", "active")
GEO_OK, GEO_PENDING = "OK", "PENDING"
LAT_RANGE, LON_RANGE = (-90.0, 90.0), (-180.0, 180.0)
# Módulo de la matriz de permisos (sql/15) dueño de los puntos de entrega.
MODULE = "puntos_entrega"


class DatosInvalidos(Exception):
    """Body inválido (falta un campo, coordenada fuera de rango, etc.)."""


def requerido(body: dict, key: str, label: str) -> str:
    value = str(body.get(key) or "").strip()
    if not value:
        raise DatosInvalidos(f"{label} es obligatorio")
    return value


def _coordenada(value: object, bounds: tuple[float, float], label: str) -> float | None:
    if value in (None, ""):
        return None
    try:
        number = float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError) as err:
        raise DatosInvalidos(f"{label} debe ser numérica") from err
    if not bounds[0] <= number <= bounds[1]:
        raise DatosInvalidos(f"{label} fuera de rango")
    return number


@dataclass(frozen=True)
class Direccion:
    """Valores de una dirección listos para persistir (textos + coords + geo-status)."""

    line1: str | None
    line2: str | None
    city: str | None
    state: str | None
    latitude: float | None
    longitude: float | None
    geocoding_status: str

    def as_params(self) -> list:
        """Orden esperado por el INSERT/UPDATE de addresses (el status va dos veces:
        columna y guard del geocoded_at)."""
        return [self.line1, self.line2, self.city, self.state, self.latitude,
                self.longitude, self.geocoding_status, self.geocoding_status]


def direccion_desde(address: dict) -> Direccion:
    """Valida coordenadas (juntas o ninguna) y deriva el estado de geocodificación."""
    lat = _coordenada(address.get("latitude"), LAT_RANGE, "La latitud")
    lon = _coordenada(address.get("longitude"), LON_RANGE, "La longitud")
    if (lat is None) != (lon is None):
        raise DatosInvalidos("Latitud y longitud van juntas (las dos o ninguna)")
    status = GEO_OK if lat is not None else GEO_PENDING
    texts = [str(address.get(field) or "").strip() or None for field in ADDRESS_FIELDS]
    return Direccion(texts[0], texts[1], texts[2], texts[3], lat, lon, status)


def campos_editables(body: dict) -> dict:
    """Filtra el body a los campos editables de un punto (normaliza vacíos a None,
    active a bool). Valida que si viene `name`, no esté vacío."""
    fields = {
        key: (bool(body[key]) if key == "active" else (body[key] or None))
        for key in POINT_FIELDS
        if key in body
    }
    if "name" in fields and not fields["name"]:
        raise DatosInvalidos("El nombre es obligatorio")
    return fields
