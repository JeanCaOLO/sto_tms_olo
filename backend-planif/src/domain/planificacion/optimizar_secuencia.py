"""Regla §3.4: optimizar la secuencia de paradas de un viaje.

Portado de `optimize-stops.ts` (dev): vecino más cercano + mejora local 2-opt
(`dosOpt`) sobre una ruta ABIERTA (sin volver al depósito).

Sin matriz de distancias real: se usa distancia euclidiana en grados (mismo
fallback que el front cuando la matriz no cubre un par). Los pedidos sin
coordenadas quedan al final ordenados por zona/ciudad, no se descartan
(Reunión 2026-08-18).
"""

from __future__ import annotations

import math

from domain.models import Pedido

MAX_PASADAS_2OPT = 30
EPSILON = 1e-9


def _distancia(a: Pedido, b: Pedido) -> float:
    # Euclidiana en grados: sin km reales, pero el orden relativo alcanza para
    # el vecino más cercano y el 2-opt. Reemplazable por una matriz real luego.
    lat1, lng1 = a.delivery_latitude or 0.0, a.delivery_longitude or 0.0
    lat2, lng2 = b.delivery_latitude or 0.0, b.delivery_longitude or 0.0
    return math.hypot(lat1 - lat2, lng1 - lng2)


def _clave_zona(pedido: Pedido) -> str:
    return (pedido.delivery_zone or "") + (pedido.delivery_city or "")


def _vecino_mas_cercano(con_coords: list[Pedido]) -> list[Pedido]:
    visitados: set[str] = set()
    ruta: list[Pedido] = [con_coords[0]]
    visitados.add(con_coords[0].id)
    actual = con_coords[0]
    while len(ruta) < len(con_coords):
        siguiente: Pedido | None = None
        min_dist = math.inf
        for candidato in con_coords:
            if candidato.id in visitados:
                continue
            distancia = _distancia(actual, candidato)
            if distancia < min_dist:
                min_dist = distancia
                siguiente = candidato
        if siguiente is None:
            break
        visitados.add(siguiente.id)
        ruta.append(siguiente)
        actual = siguiente
    return ruta


def _dos_opt(ruta: list[Pedido]) -> list[Pedido]:
    """Mejora local 2-opt sobre ruta abierta: invierte segmentos que acortan la
    ruta hasta que no haya mejora (tope 30 pasadas). O(n²) por pasada.
    """
    n = len(ruta)
    if n < 4:
        return ruta
    best = list(ruta)
    mejora = True
    pasada = 0
    while mejora and pasada < MAX_PASADAS_2OPT:
        mejora = False
        pasada += 1
        for i in range(1, n - 1):
            for j in range(i, n - 1):
                antes = _distancia(best[i - 1], best[i]) + _distancia(best[j], best[j + 1])
                despues = _distancia(best[i - 1], best[j]) + _distancia(best[i], best[j + 1])
                if despues + EPSILON < antes:
                    best[i : j + 1] = best[i : j + 1][::-1]
                    mejora = True
    return best


def optimizar_secuencia(pedidos: list[Pedido]) -> list[Pedido]:
    """Devuelve los pedidos reordenados como paradas de una ruta optimizada.

    Con < 2 pedidos geolocalizados no hay nada que optimizar: se ordena todo por
    zona/ciudad. Con coordenadas: vecino más cercano + 2-opt, y los sin coords
    se anexan al final ordenados por zona.
    """
    if len(pedidos) <= 1:
        return list(pedidos)

    con_coords = [p for p in pedidos if p.has_coords]
    sin_coords = [p for p in pedidos if not p.has_coords]

    if len(con_coords) < 2:
        return sorted(pedidos, key=_clave_zona)

    optimizados = _dos_opt(_vecino_mas_cercano(con_coords))
    return optimizados + sorted(sin_coords, key=_clave_zona)
