"""Adaptador Aurora del port VehiculoRepo (vehicles)."""

from __future__ import annotations

from domain.models import Vehiculo
from adapters.outbound.aurora import mocks
from adapters.outbound.aurora.schema_probe import tabla_existe
from adapters.outbound.aurora.sql import VEHICLES_SQL
from lib.tms_common import pg


def _to_vehiculo(row: dict) -> Vehiculo:
    return Vehiculo(
        id=str(row["id"]),
        capacity_weight=row.get("capacity_weight") or 0.0,
        capacity_volume=row.get("capacity_volume") or 0.0,
        is_owned=bool(row.get("is_owned")),
        driver_id=(str(row["driver_id"]) if row.get("driver_id") else None),
        label=row.get("label"),
    )


class AuroraVehiculoRepo:
    """Implementa `ports.VehiculoRepo`. Mock si `vehicles` no existe todavía."""

    def disponibles(self, organization_id: str, warehouse_id: str | None) -> list[Vehiculo]:
        if not tabla_existe("vehicles"):
            return list(mocks.MOCK_VEHICULOS)
        rows = pg.query(VEHICLES_SQL, [organization_id])
        return [_to_vehiculo(r) for r in rows]
