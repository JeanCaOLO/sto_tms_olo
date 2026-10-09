"""Port: lectura de pedidos planificables (orders + order_items)."""

from __future__ import annotations

from typing import Protocol

from domain.models import Pedido


class PedidoRepo(Protocol):
    """Lee pedidos alistados listos para planificar, ya agregados con
    peso/volumen desde `order_items`. El scope (país/almacén) lo aplica el
    adaptador con el contexto operativo del usuario, no un `?pais`.
    """

    def planificables(
        self, organization_id: str, warehouse_id: str | None, plan_date: str,
        customer_id: str | None = None,
    ) -> list[Pedido]:
        """Pedidos con `delivery_date = plan_date` del almacén del contexto, en
        estado alistado, opcionalmente filtrados por compañía (`customer_id`).
        Lista vacía si no hay ninguno."""
        ...

    def por_ids(self, order_ids: list[str]) -> list[Pedido]:
        """Pedidos concretos por id (para revalidar capacidad en el PUT)."""
        ...

    def articulos_de(self, order_id: str) -> list[dict]:
        """Líneas/artículos de un pedido (order_items) para el detalle del pin.
        Lista vacía si no hay o si la tabla no existe."""
        ...
