"""Geometría del planificador: distancias en línea recta, T-n por distancia, orden
de paradas por vecino más cercano desde el depósito, y la SEDE de cada almacén
(depósito de salida y región del mapa de carreteras)."""

import logging
import math
from dataclasses import dataclass

# Depósito por defecto de Costa Rica (San José, GAM) cuando el almacén no tiene
# coordenadas, y alcance de una jornada (línea recta): knobs del T-n.
DEPOT_CR = (9.9281, -84.0907)
KM_POR_DIA = 70

# Región del mapa de carreteras (OSRM) según el código de país del almacén. Los
# países MOCK usan el mapa del país real. Un país sin región se mide en línea recta.
REGIONES = {"CR": "CR", "DCR": "CR", "VN": "VN", "DVE": "VN"}

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class Sede:
    """De dónde salen los camiones de un almacén y con qué mapa se miden.
    `origen` dice de dónde salió el depósito: 'almacen' (coordenadas del almacén),
    'defecto_cr' (San José), 'centro_pedidos' (sin dato: centro de los pedidos) o
    'sin_datos' (ni almacén ni pedidos con coordenadas: el depósito no influye)."""
    deposito: tuple[float, float]
    region: str | None
    origen: str


SEDE_CR = Sede(DEPOT_CR, "CR", "defecto_cr")


def sede_de(pais: str | None, lat: float | None, lng: float | None, pedidos: list[dict]) -> Sede:
    """Sede de un almacén. Sin coordenadas del almacén: San José si es de Costa Rica; si
    no, el centro de los pedidos del día (aproximación: el T-n sale corto)."""
    region = REGIONES.get((pais or "").upper())
    if lat is not None and lng is not None:
        return Sede((lat, lng), region, "almacen")
    if region == "CR":
        return Sede(DEPOT_CR, region, "defecto_cr")
    con = [(o["lat"], o["lng"]) for o in pedidos if o.get("lat") is not None and o.get("lng") is not None]
    if not con:
        # Sin ningún punto no hay nada que ordenar ni T-n que medir (piso de 1 día): el depósito no influye.
        log.warning("almacén de %s sin coordenadas y ningún pedido con coordenadas: no se puede ubicar el depósito", pais)
        return Sede(DEPOT_CR, region, "sin_datos")
    centro = (sum(p[0] for p in con) / len(con), sum(p[1] for p in con) / len(con))
    log.warning("almacén de %s sin coordenadas: depósito = centro de %s pedidos %s", pais, len(con), centro)
    return Sede(centro, region, "centro_pedidos")


def haversine_km(a: tuple[float, float], b: tuple[float, float]) -> float:
    r = 6371.0
    dlat, dlng = math.radians(b[0] - a[0]), math.radians(b[1] - a[1])
    h = math.sin(dlat / 2) ** 2 + math.cos(math.radians(a[0])) * math.cos(math.radians(b[0])) * math.sin(dlng / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def lead_time_dias(pedidos: list[dict], deposito: tuple[float, float] = DEPOT_CR) -> int:
    """T-n por distancia de la parada más lejana al depósito; sin coords → piso de 1 día (nunca None)."""
    kms = [haversine_km(deposito, (o["lat"], o["lng"])) for o in pedidos if o["lat"] is not None and o["lng"] is not None]
    return 1 + int(max(kms) // KM_POR_DIA) if kms else 1  # ponytail: piso sin coords; upgrade = geocodificar en el ingest


def ordenar_por_ruta(pedidos: list[dict], deposito: tuple[float, float] = DEPOT_CR) -> list[dict]:
    """Ordena las paradas por vecino más cercano desde el depósito, para que el
    nº de parada 1→N siga el camino real (y los pedidos del mismo punto queden
    consecutivos). Los pedidos sin coordenadas van al final."""
    con = [o for o in pedidos if o["lat"] is not None and o["lng"] is not None]
    sin = [o for o in pedidos if o["lat"] is None or o["lng"] is None]
    orden: list[dict] = []
    actual = deposito
    while con:
        nxt = min(con, key=lambda o: haversine_km(actual, (o["lat"], o["lng"])))
        orden.append(nxt)
        con.remove(nxt)
        actual = (nxt["lat"], nxt["lng"])
    return orden + sin
