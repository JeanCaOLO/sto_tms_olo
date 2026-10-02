"""Casos de uso EFLOW (read-only): health, viajes, pedidos por viaje y catálogos.

Orquesta el port `EflowSource` (fuente real o mock) con la normalización de país
y el clamp del límite. No conoce HTTP ni SQL: recibe país (ya normalizado por el
adaptador inbound vía eflow_db) y parámetros ya parseados, y devuelve filas.
Portado de la lógica de `origin/main:backend/eflow/src/app.py`.
"""

from __future__ import annotations

from ports.eflow_repo import EflowSource
from lib.tms_common.errors import HttpError

DEFAULT_LIMIT = 100
MAX_LIMIT = 1000


class EflowService:
    def __init__(self, source: EflowSource) -> None:
        self._source = source

    def health(self, country: str) -> dict:
        return self._source.health(country)

    def trips(self, country: str, limit: int | None) -> list[dict]:
        requested = limit or DEFAULT_LIMIT
        return self._source.trips(country, min(max(requested, 1), MAX_LIMIT))

    def trip(self, country: str, trip_id: int) -> dict:
        row = self._source.trip(country, trip_id)
        if row is None:
            raise HttpError(404, "not_found")
        return row

    def trip_orders(self, country: str, trip_id: int) -> list[dict]:
        return self._source.trip_orders(country, trip_id)

    def routes(self, country: str) -> list[dict]:
        return self._source.routes(country)

    def carriers(self, country: str) -> list[dict]:
        return self._source.carriers(country)

    def drivers(self, country: str, carrier_id: int | None) -> list[dict]:
        return self._source.drivers(country, carrier_id)

    def vehicles(self, country: str, carrier_id: int | None) -> list[dict]:
        return self._source.vehicles(country, carrier_id)

    def route_days(self, country: str) -> list[dict]:
        return self._source.route_days(country)
