"""T-n (días de anticipación de la salida) por tiempo real de carretera. Fase 5.

Hoy el T-n sale de la distancia en LÍNEA RECTA de la parada más lejana al depósito
(`ruta_geo.lead_time_dias`: 1 día + 1 por cada 70 km). Con `TN_MODO=carretera` sale
del tiempo de MANEJO por carretera (OSRM) del depósito a la parada más lejana:

    lead = 1 + minutos_de_manejo_max // TN_MIN_POR_DIA

`dispatch_date = delivery_date - lead` es lo que usa el OMS para liberar el pedido a
eFlow: cambiar el modo mueve fechas de salida. Por eso viene APAGADO (`linea`) y la
comparación de motores mide cuántos viajes cambiarían antes de activarlo.

`TN_MIN_POR_DIA` (135 por defecto) se calibró para reproducir el T-n actual en los planes
reales de Costa Rica (ver docs/work/2026-11/2026-11-13-motor-ruteo-fases-5-6-7.md). Si
OSRM no responde, el viaje se queda con el T-n en línea recta.
"""

import os

import matriz_distancias
from ruta_geo import Sede

MODO_LINEA = "linea"
MODO_CARRETERA = "carretera"
# Calibrado 2026-11-13 sobre 236 viajes reales de Cofersa (OSRM): con 135 min/día el T-n por
# carretera coincide con el actual en 213 (90 %). Los otros 23 son inconsistencias de la regla en
# línea recta (viajes T-1 con hasta 3 h de manejo y T-2 con menos de 2 h).
MIN_POR_DIA_DEFECTO = 135.0


def modo() -> str:
    return MODO_CARRETERA if os.environ.get("TN_MODO", "").strip().lower() == MODO_CARRETERA else MODO_LINEA


def min_por_dia() -> float:
    try:
        valor = float(os.environ.get("TN_MIN_POR_DIA", "") or MIN_POR_DIA_DEFECTO)
        return valor if valor > 0 else MIN_POR_DIA_DEFECTO
    except ValueError:
        return MIN_POR_DIA_DEFECTO


def lead_por_minutos(minutos: float | None, por_dia: float | None = None) -> int:
    """1 día + uno más por cada `por_dia` minutos de manejo; sin dato → piso de 1 día."""
    por_dia = min_por_dia() if por_dia is None else por_dia
    return 1 if minutos is None else 1 + int(minutos // por_dia)


def minutos_maximos(viajes: list[dict], sede: Sede) -> list[float | None]:
    """Por viaje, los minutos de manejo del depósito a su parada más lejana (por tiempo).
    None si el viaje no tiene paradas con coordenadas o si OSRM no respondió."""
    puntos, de_viaje = [], []
    for i, v in enumerate(viajes):
        for o in v["pedidos"]:
            if o["lat"] is not None and o["lng"] is not None:
                puntos.append((o["lat"], o["lng"]))
                de_viaje.append(i)
    if not puntos:
        return [None] * len(viajes)
    minutos = matriz_distancias.desde(sede.deposito, puntos, region=sede.region)
    maximos: list[float | None] = [None] * len(viajes)
    if minutos is None:
        return maximos
    for i, m in zip(de_viaje, minutos):
        maximos[i] = m if maximos[i] is None else max(maximos[i], m)
    return maximos


def ajustar(viajes: list[dict], sede: Sede, informe: dict | None = None) -> None:
    """Con `TN_MODO=carretera`, reemplaza el `lead` de cada viaje por el de carretera."""
    if informe is not None:
        informe["tn_modo"] = modo()
    if modo() != MODO_CARRETERA or not viajes:
        return
    por_dia = min_por_dia()
    for v, minutos in zip(viajes, minutos_maximos(viajes, sede)):
        if minutos is not None:
            v["lead"] = lead_por_minutos(minutos, por_dia)
