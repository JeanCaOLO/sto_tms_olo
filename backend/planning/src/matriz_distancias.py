"""Matriz de distancias y tiempos entre puntos, para el motor de ruteo.

Pide la matriz N×N completa al OSRM propio (servicio /table: distancia y duración
reales por calle) en UNA llamada. Si no hay OSRM configurado (`OSRM_URL` vacío), no
responde o devuelve algo incompleto, cae a línea recta con factor de rodeo: el
planificador nunca se detiene por el mapa. `fuente` dice de dónde salió el dato.

Todavía no la consume `motor_ruteo` (la heurística actual sigue en línea recta);
es el insumo del solver (fase 3) y del T-n por carretera (fase 5).
"""

import json
import logging
import os
import urllib.error
import urllib.request

from ruta_geo import haversine_km

# Respaldo sin red, mismos supuestos que el frontend (distance-matrix.ts): rodeo de
# calle sobre línea recta y velocidad media. ponytail: ignora tráfico y tipo de vía.
FACTOR_RODEO = 1.35
VELOCIDAD_KMH = 30
TIMEOUT_S = 5

log = logging.getLogger(__name__)


def _linea_recta(puntos: list[tuple[float, float]]) -> dict:
    km = [[0.0 if i == j else haversine_km(a, b) * FACTOR_RODEO for j, b in enumerate(puntos)]
          for i, a in enumerate(puntos)]
    minutos = [[d / VELOCIDAD_KMH * 60 for d in fila] for fila in km]
    return {"km": km, "min": minutos, "fuente": "haversine"}


def _completa(tabla, n: int) -> bool:
    return (isinstance(tabla, list) and len(tabla) == n
            and all(isinstance(f, list) and len(f) == n and all(isinstance(x, (int, float)) for x in f) for f in tabla))


def _osrm(puntos: list[tuple[float, float]], base_url: str) -> dict | None:
    coords = ";".join(f"{lng:.6f},{lat:.6f}" for lat, lng in puntos)  # OSRM va en lng,lat
    url = f"{base_url.rstrip('/')}/table/v1/driving/{coords}?annotations=distance,duration"
    try:
        with urllib.request.urlopen(url, timeout=TIMEOUT_S) as res:
            data = json.loads(res.read())
    except (urllib.error.URLError, TimeoutError, ValueError, OSError) as e:
        log.warning("OSRM no respondió (%s): se usa línea recta", e)
        return None
    n = len(puntos)
    # Un par sin ruta llega como null: la matriz incompleta no sirve a un solver.
    if data.get("code") != "Ok" or not _completa(data.get("distances"), n) or not _completa(data.get("durations"), n):
        log.warning("OSRM devolvió una matriz inválida o incompleta (code=%s): se usa línea recta", data.get("code"))
        return None
    return {"km": [[m / 1000 for m in fila] for fila in data["distances"]],
            "min": [[s / 60 for s in fila] for fila in data["durations"]], "fuente": "osrm"}


def construir(puntos: list[tuple[float, float]], base_url: str | None = None) -> dict:
    """Matriz entre `puntos` (lat, lng), en su mismo orden: `{"km", "min", "fuente"}`,
    con `km[i][j]` y `min[i][j]` de i a j y `fuente` = 'osrm' o 'haversine'."""
    base_url = os.environ.get("OSRM_URL", "") if base_url is None else base_url
    if base_url and len(puntos) >= 2:
        matriz = _osrm(puntos, base_url)
        if matriz:
            return matriz
    return _linea_recta(puntos)


def estado() -> dict:
    """Diagnóstico (acción `estado_ruteo` de la Lambda): ¿responde el OSRM configurado?
    Mide el depósito de San José contra Cartago y Liberia."""
    puntos = [(9.9281, -84.0907), (9.8644, -83.9194), (10.6350, -85.4377)]
    m = construir(puntos)
    return {"osrm_url": os.environ.get("OSRM_URL", ""), "fuente": m["fuente"],
            "san_jose_cartago": {"km": round(m["km"][0][1], 1), "min": round(m["min"][0][1])},
            "san_jose_liberia": {"km": round(m["km"][0][2], 1), "min": round(m["min"][0][2])}}
