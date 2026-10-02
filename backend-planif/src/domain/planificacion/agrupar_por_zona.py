"""Regla §3.2: agrupar los pedidos planificables por zona de entrega.

`delivery_zone` es el código de ruta del WMS (como la operación agrupa destinos
hoy). Los pedidos sin zona caen en un grupo propio (clave `""`) para que igual
se planifiquen, en vez de descartarse.
"""

from __future__ import annotations

from collections import defaultdict

from domain.models import Pedido

SIN_ZONA = ""


def agrupar_por_zona(pedidos: list[Pedido]) -> dict[str, list[Pedido]]:
    """Agrupa pedidos por `delivery_zone`. Orden estable dentro de cada zona.

    Devuelve un dict {zona: [pedidos]} con las zonas ordenadas alfabéticamente
    para que la salida del motor sea determinista (mismo input → mismo plan).
    """
    grupos: dict[str, list[Pedido]] = defaultdict(list)
    for pedido in pedidos:
        grupos[pedido.delivery_zone or SIN_ZONA].append(pedido)
    return {zona: grupos[zona] for zona in sorted(grupos)}
