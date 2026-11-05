"""Geometría del planificador: distancias en línea recta, T-n por distancia y orden
de paradas por vecino más cercano desde el depósito."""

import math

# Depósito de origen CR + alcance de una jornada (línea recta): knob del T-n.
DEPOT_CR = (9.9281, -84.0907)
KM_POR_DIA = 70


def haversine_km(a: tuple[float, float], b: tuple[float, float]) -> float:
    r = 6371.0
    dlat, dlng = math.radians(b[0] - a[0]), math.radians(b[1] - a[1])
    h = math.sin(dlat / 2) ** 2 + math.cos(math.radians(a[0])) * math.cos(math.radians(b[0])) * math.sin(dlng / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def lead_time_dias(pedidos: list[dict]) -> int:
    """T-n por distancia de la parada más lejana al depósito; sin coords → piso de 1 día (nunca None)."""
    kms = [haversine_km(DEPOT_CR, (o["lat"], o["lng"])) for o in pedidos if o["lat"] is not None and o["lng"] is not None]
    return 1 + int(max(kms) // KM_POR_DIA) if kms else 1  # ponytail: piso sin coords; upgrade = geocodificar en el ingest


def ordenar_por_ruta(pedidos: list[dict]) -> list[dict]:
    """Ordena las paradas por vecino más cercano desde el depósito, para que el
    nº de parada 1→N siga el camino real (y los pedidos del mismo punto queden
    consecutivos). Los pedidos sin coordenadas van al final."""
    con = [o for o in pedidos if o["lat"] is not None and o["lng"] is not None]
    sin = [o for o in pedidos if o["lat"] is None or o["lng"] is None]
    orden: list[dict] = []
    actual = DEPOT_CR
    while con:
        nxt = min(con, key=lambda o: haversine_km(actual, (o["lat"], o["lng"])))
        orden.append(nxt)
        con.remove(nxt)
        actual = (nxt["lat"], nxt["lng"])
    return orden + sin
