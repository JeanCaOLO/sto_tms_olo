"""Matriz de distancias y tiempos entre puntos, para el motor de ruteo.

Pide la matriz N×N completa al OSRM propio (servicio /table: distancia y duración
reales por calle) en UNA llamada. Si no hay OSRM configurado para la región, no
responde o devuelve algo incompleto, cae a línea recta con factor de rodeo: el
planificador nunca se detiene por el mapa. `fuente` dice de dónde salió el dato.

`OSRM_URL` admite un OSRM por región (mapa de cada país):
`CR=http://10.0.0.1:5000;VN=http://10.0.0.1:5001`. Una URL sola (sin `=`) sirve a
todas las regiones (compatibilidad con la fase 2). La consumen el solver y la
comparación de motores; la heurística sigue en línea recta.
"""

import json
import logging
import os
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor

from ruta_geo import haversine_km

# Respaldo sin red, mismos supuestos que el frontend (distance-matrix.ts): rodeo de
# calle sobre línea recta y velocidad media. ponytail: ignora tráfico y tipo de vía.
FACTOR_RODEO = 1.35
VELOCIDAD_KMH = 30
TIMEOUT_S = 5
# Más de BLOQUE puntos (un día grande de Venezuela): la matriz se pide por bloques de
# BLOQUE×BLOQUE, en paralelo. Cada consulta lleva ≤ 2×BLOQUE coordenadas: URL corta y
# muy por debajo del tope del servidor (--max-table-size 1000, infra/osrm).
BLOQUE = 100
HILOS = 8

log = logging.getLogger(__name__)


def _linea_recta(puntos: list[tuple[float, float]]) -> dict:
    km = [[0.0 if i == j else haversine_km(a, b) * FACTOR_RODEO for j, b in enumerate(puntos)]
          for i, a in enumerate(puntos)]
    minutos = [[d / VELOCIDAD_KMH * 60 for d in fila] for fila in km]
    return {"km": km, "min": minutos, "fuente": "haversine"}


def _completa(tabla, filas: int, columnas: int | None = None) -> bool:
    columnas = filas if columnas is None else columnas
    return (isinstance(tabla, list) and len(tabla) == filas
            and all(isinstance(f, list) and len(f) == columnas and all(isinstance(x, (int, float)) for x in f)
                    for f in tabla))


def _tabla(puntos: list[tuple[float, float]], base_url: str, origenes: list[int] | None = None,
           destinos: list[int] | None = None) -> tuple[list, list] | None:
    """Una consulta /table: (metros, segundos) de `origenes` a `destinos` (índices en
    `puntos`; None = todos). None si falla o viene incompleta."""
    coords = ";".join(f"{lng:.6f},{lat:.6f}" for lat, lng in puntos)  # OSRM va en lng,lat
    url = f"{base_url.rstrip('/')}/table/v1/driving/{coords}?annotations=distance,duration"
    if origenes is not None:
        url += "&sources=" + ";".join(map(str, origenes)) + "&destinations=" + ";".join(map(str, destinos))
    try:
        with urllib.request.urlopen(url, timeout=TIMEOUT_S) as res:
            data = json.loads(res.read())
    except (urllib.error.URLError, TimeoutError, ValueError, OSError) as e:
        log.warning("OSRM no respondió (%s): se usa línea recta", e)
        return None
    filas = len(puntos) if origenes is None else len(origenes)
    columnas = len(puntos) if destinos is None else len(destinos)
    # Un par sin ruta llega como null: la matriz incompleta no sirve a un solver.
    if (data.get("code") != "Ok" or not _completa(data.get("distances"), filas, columnas)
            or not _completa(data.get("durations"), filas, columnas)):
        log.warning("OSRM devolvió una matriz inválida o incompleta (code=%s): se usa línea recta", data.get("code"))
        return None
    return data["distances"], data["durations"]


def _osrm(puntos: list[tuple[float, float]], base_url: str) -> dict | None:
    n = len(puntos)
    if n <= BLOQUE:
        tabla = _tabla(puntos, base_url)
        if tabla is None:
            return None
        metros, segundos = tabla
    else:
        bloques = [list(range(i, min(i + BLOQUE, n))) for i in range(0, n, BLOQUE)]

        def pedir(par):
            a, b = par
            union = a if a is b else a + b  # en la consulta: primero los orígenes, luego los destinos
            destinos = range(len(a)) if a is b else range(len(a), len(a) + len(b))
            return a, b, _tabla([puntos[i] for i in union], base_url, list(range(len(a))), list(destinos))

        with ThreadPoolExecutor(HILOS) as pool:
            partes = list(pool.map(pedir, [(a, b) for a in bloques for b in bloques]))
        if any(t is None for _, _, t in partes):
            return None
        metros = [[0.0] * n for _ in range(n)]
        segundos = [[0.0] * n for _ in range(n)]
        for a, b, (m, s) in partes:
            for fi, i in enumerate(a):
                for cj, j in enumerate(b):
                    metros[i][j], segundos[i][j] = m[fi][cj], s[fi][cj]
    return {"km": [[m / 1000 for m in fila] for fila in metros],
            "min": [[s / 60 for s in fila] for fila in segundos], "fuente": "osrm"}


def url_de(region: str | None, config: str | None = None) -> str:
    """URL del OSRM de la región según `OSRM_URL` ('' = no hay: línea recta)."""
    config = (os.environ.get("OSRM_URL", "") if config is None else config).strip()
    if "=" not in config:
        return config
    urls = dict(par.split("=", 1) for par in config.split(";") if "=" in par)
    return urls.get((region or "").upper(), "").strip()


def construir(puntos: list[tuple[float, float]], base_url: str | None = None, region: str | None = "CR") -> dict:
    """Matriz entre `puntos` (lat, lng), en su mismo orden: `{"km", "min", "fuente"}`,
    con `km[i][j]` y `min[i][j]` de i a j y `fuente` = 'osrm' o 'haversine'. `base_url`
    fuerza un servidor; si no, se toma el de la `region` en `OSRM_URL`."""
    base_url = url_de(region) if base_url is None else base_url
    if base_url and len(puntos) >= 2:
        matriz = _osrm(puntos, base_url)
        if matriz:
            return matriz
    return _linea_recta(puntos)


# Diagnóstico: un tramo de prueba por región (origen → destino).
_PRUEBAS = {"CR": ("san_jose_liberia", (9.9281, -84.0907), (10.6350, -85.4377)),
            "VN": ("valencia_caracas", (10.1620, -68.0077), (10.4806, -66.9036))}


def estado() -> dict:
    """Diagnóstico (acción `estado_ruteo` de la Lambda): ¿responde el OSRM de cada región?"""
    regiones = {}
    for region, (tramo, a, b) in _PRUEBAS.items():
        m = construir([a, b], region=region)
        regiones[region] = {"url": url_de(region), "fuente": m["fuente"], "tramo": tramo,
                            "km": round(m["km"][0][1], 1), "min": round(m["min"][0][1])}
    return {"osrm_url": os.environ.get("OSRM_URL", ""), "regiones": regiones}
