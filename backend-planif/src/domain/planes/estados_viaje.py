"""Máquina de estados de un viaje (plan_trip), independiente del plan.

    pending ──▶ completed
       └──────▶ cancelled

`completed` y `cancelled` son terminales. El estado del viaje no afecta al del
plan: cada ruta/camión cierra su propio ciclo (el chofer completa SU ruta).
"""

from __future__ import annotations

PENDING = "pending"
COMPLETED = "completed"
CANCELLED = "cancelled"

ESTADOS = frozenset({PENDING, COMPLETED, CANCELLED})

_TRANSICIONES: dict[str, frozenset[str]] = {
    PENDING: frozenset({COMPLETED, CANCELLED}),
    COMPLETED: frozenset(),
    CANCELLED: frozenset(),
}


class TransicionViajeInvalida(Exception):
    """El viaje no puede pasar de `origen` a `destino`."""

    def __init__(self, origen: str, destino: str):
        super().__init__(f"Transición de viaje inválida: {origen} → {destino}")
        self.origen = origen
        self.destino = destino


def transicionar(origen: str, destino: str) -> str:
    if destino not in _TRANSICIONES.get(origen, frozenset()):
        raise TransicionViajeInvalida(origen, destino)
    return destino
