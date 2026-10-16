"""Adaptador Aurora del port PedidoRepo (orders + order_items)."""

from __future__ import annotations

from domain.models import Pedido
from adapters.outbound.aurora import mocks
from adapters.outbound.aurora.schema_probe import tabla_existe
from adapters.outbound.aurora.sql import ITEMS_BY_ORDER_SQL, ORDERS_BY_IDS_SQL, ORDERS_SQL
from lib.tms_common import pg


def _to_pedido(row: dict) -> Pedido:
    return Pedido(
        id=str(row["id"]),
        order_number=row.get("order_number"),
        customer_id=(str(row["customer_id"]) if row.get("customer_id") else None),
        customer_name=row.get("customer_name"),
        delivery_zone=row.get("delivery_zone"),
        delivery_city=row.get("delivery_city"),
        delivery_latitude=row.get("delivery_latitude"),
        delivery_longitude=row.get("delivery_longitude"),
        total_weight=row.get("total_weight"),
        total_volume=row.get("total_volume"),
        priority=row.get("priority"),
    )


class AuroraPedidoRepo:
    """Implementa `ports.PedidoRepo`. Si `orders` no existe (WT-1 pendiente),
    devuelve pedidos mock para poder ejercitar el motor."""

    def planificables(
        self, organization_id: str, warehouse_id: str | None, plan_date: str,
        customer_id: str | None = None,
    ) -> list[Pedido]:
        if not tabla_existe("orders"):
            return list(mocks.MOCK_PEDIDOS)
        rows = pg.query(
            ORDERS_SQL,
            [organization_id, warehouse_id, warehouse_id, customer_id, customer_id, plan_date],
        )
        return [_to_pedido(r) for r in rows]

    def por_ids(self, order_ids: list[str]) -> list[Pedido]:
        if not order_ids:
            return []
        if not tabla_existe("orders"):
            return [p for p in mocks.MOCK_PEDIDOS if p.id in set(order_ids)]
        rows = pg.query(ORDERS_BY_IDS_SQL, [order_ids])
        return [_to_pedido(r) for r in rows]

    def articulos_de(self, order_id: str) -> list[dict]:
        if not order_id or not tabla_existe("order_items"):
            return []
        return [
            {
                "product_code": r.get("product_code"),
                "product_name": r.get("product_name"),
                "quantity": r.get("quantity"),
                "weight": r.get("weight"),
                "volume": r.get("volume"),
                "guia_fiscal": r.get("guia_fiscal"),
            }
            for r in pg.query(ITEMS_BY_ORDER_SQL, [order_id])
        ]
