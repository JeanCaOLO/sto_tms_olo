"""Port: catálogo de zonas de entrega."""

from __future__ import annotations

from typing import Protocol


class ZonaRepo(Protocol):
    """Zonas de entrega del almacén. El motor agrupa por `delivery_zone` del
    pedido; este port existe para validar/enumerar zonas conocidas (p. ej. en el
    PUT de edición) sin acoplar el dominio a la tabla `zones`."""

    def codigos(self, organization_id: str, warehouse_id: str | None) -> list[str]:
        ...
