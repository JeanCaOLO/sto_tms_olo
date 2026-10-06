"""Fuente EFLOW real: SELECT parametrizados contra el SQL Server del país.

Implementa `ports.EflowSource`. Portado de `origin/main:backend/eflow/live_source.py`.
Usa `lib.tms_common.eflow_db` (conexiones read-only por país) y los builders
puros del dominio (`domain.eflow.consultas`).
"""

from __future__ import annotations

from domain.eflow import consultas as q
from lib.tms_common import eflow_db
from lib.tms_common.config import EflowConfig
from lib.tms_common.errors import HttpError


class LiveEflowSource:
    """Implementa `ports.EflowSource` contra EFLOW real."""

    @staticmethod
    def _names(country: str) -> EflowConfig:
        return eflow_db.db_names(country)

    def health(self, country: str) -> dict:
        rows = eflow_db.query(country, "SELECT 1 AS ok")
        return {"ok": rows[0]["ok"] == 1, "pais": country}

    def trips(self, country: str, limit: int) -> list[dict]:
        names = self._names(country)
        return eflow_db.query(country, q.list_trips(names.db_wmh, names.db_sap), {"limit": limit})

    def trip(self, country: str, trip_id: int) -> dict | None:
        names = self._names(country)
        rows = eflow_db.query(country, q.get_trip(names.db_wmh, names.db_sap), {"id": trip_id})
        return rows[0] if rows else None

    def trip_orders(self, country: str, trip_id: int) -> list[dict]:
        names = self._names(country)
        return eflow_db.query(country, q.list_trip_orders(names.db_wmh, names.db_sap), {"trip_id": trip_id})

    def routes(self, country: str) -> list[dict]:
        return eflow_db.query(country, q.list_routes(self._names(country).db_wmh))

    def carriers(self, country: str) -> list[dict]:
        return eflow_db.query(country, q.list_carriers(self._names(country).db_wmh))

    def drivers(self, country: str, carrier_id: int | None) -> list[dict]:
        return eflow_db.query(country, q.list_drivers(self._names(country).db_wmh), {"carrier_id": carrier_id})

    def vehicles(self, country: str, carrier_id: int | None) -> list[dict]:
        return eflow_db.query(country, q.list_vehicles(self._names(country).db_wmh), {"carrier_id": carrier_id})

    def route_days(self, country: str) -> list[dict]:
        # Vive solo en el repo TMS-Backend; falta portar su SQL (RUTA_DIA_AB).
        raise HttpError(501, "rutas_dias_not_ported")
