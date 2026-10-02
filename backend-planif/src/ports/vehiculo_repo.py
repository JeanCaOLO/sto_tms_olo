"""Port: lectura de la flota disponible (vehicles)."""

from __future__ import annotations

from typing import Protocol

from domain.models import Vehiculo


class VehiculoRepo(Protocol):
    """Lee los vehículos disponibles para un almacén/día. `is_owned` marca la
    flota propia (el motor la usa primero, §3)."""

    def disponibles(self, organization_id: str, warehouse_id: str | None) -> list[Vehiculo]:
        ...
