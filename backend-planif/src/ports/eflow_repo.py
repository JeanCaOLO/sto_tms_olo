"""Port: fuente de datos EFLOW (read-only). Dos implementaciones intercambiables:
el SQL Server real (`live`) y datos fijos (`mock`), seleccionadas por EFLOW_MODE.

Todas las lecturas devuelven filas (dicts) listas para serializar; el caso de
uso solo normaliza el país y acota el límite. Contrato de filas idéntico entre
live y mock (portado de `origin/main:backend/eflow`).
"""

from __future__ import annotations

from typing import Protocol


class EflowSource(Protocol):
    def health(self, country: str) -> dict:
        """Conectividad del país (SELECT 1 en live; siempre ok en mock)."""
        ...

    def trips(self, country: str, limit: int) -> list[dict]:
        ...

    def trip(self, country: str, trip_id: int) -> dict | None:
        ...

    def trip_orders(self, country: str, trip_id: int) -> list[dict]:
        ...

    def routes(self, country: str) -> list[dict]:
        ...

    def carriers(self, country: str) -> list[dict]:
        ...

    def drivers(self, country: str, carrier_id: int | None) -> list[dict]:
        ...

    def vehicles(self, country: str, carrier_id: int | None) -> list[dict]:
        ...

    def route_days(self, country: str) -> list[dict]:
        """rutas-dias: solo mock; en live aún no está portado (HttpError 501)."""
        ...
