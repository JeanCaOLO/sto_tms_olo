"""Máquina de estados de un `route_plan` (§1).

    draft ──▶ confirmed ──▶ completed
      │            └───────▶ cancelled
      └──────────────────▶ cancelled

Nada vuelve a `draft`. `completed` y `cancelled` son terminales. Editar (PUT)
solo se permite en `draft`; eso lo valida el caso de uso, no la transición.
"""

from __future__ import annotations

DRAFT = "draft"
CONFIRMED = "confirmed"
COMPLETED = "completed"
CANCELLED = "cancelled"

ESTADOS = frozenset({DRAFT, CONFIRMED, COMPLETED, CANCELLED})
EDITABLE = frozenset({DRAFT})

_TRANSICIONES: dict[str, frozenset[str]] = {
    DRAFT: frozenset({CONFIRMED, CANCELLED}),
    CONFIRMED: frozenset({COMPLETED, CANCELLED}),
    COMPLETED: frozenset(),
    CANCELLED: frozenset(),
}


class TransicionInvalida(Exception):
    """El plan no puede pasar de `origen` a `destino`."""

    def __init__(self, origen: str, destino: str):
        super().__init__(f"Transición inválida: {origen} → {destino}")
        self.origen = origen
        self.destino = destino


def puede_transicionar(origen: str, destino: str) -> bool:
    return destino in _TRANSICIONES.get(origen, frozenset())


def transicionar(origen: str, destino: str) -> str:
    """Devuelve el estado destino si la transición es válida; si no, lanza."""
    if not puede_transicionar(origen, destino):
        raise TransicionInvalida(origen, destino)
    return destino


def es_editable(status: str) -> bool:
    return status in EDITABLE
