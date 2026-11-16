"""Puente HTTP al OSRM propio para el frontend (mapa y matriz de Planificación y Tracking).

El OSRM vive dentro de la VPC (solo lo alcanzan las Lambdas): el navegador no puede
llamarlo. Esta ruta reenvía `GET /api/v1/planificacion/osrm/{route|table}/v1/driving/<coords>`
al OSRM de la región de esos puntos y devuelve su JSON tal cual. Solo `route` y `table`,
coordenadas numéricas (máximo 100 puntos) y los parámetros de consulta que usa el frontend.
Sin OSRM para la región: 503, y el frontend usa su respaldo.
"""

import re
import urllib.error
import urllib.parse
import urllib.request

import matriz_distancias
from ruta_geo import region_de_punto
from tms_common.errors import HttpError

MAX_PUNTOS = 100
TIMEOUT_S = 8
_NUM = r"-?\d{1,3}(?:\.\d+)?"
_RUTA = re.compile(rf"^(route|table)/v1/driving/({_NUM},{_NUM}(?:;{_NUM},{_NUM})*)$")
_PARAMETROS = {"overview", "geometries", "steps", "annotations", "sources", "destinations"}
_VALOR = re.compile(r"^[A-Za-z0-9;,._-]{1,2000}$")


def reenviar(ruta: str, consulta: dict | None) -> tuple[int, bytes]:
    """(status, cuerpo JSON de OSRM) para `ruta` = 'route/v1/driving/lng,lat;…'."""
    m = _RUTA.match(ruta or "")
    if not m:
        raise HttpError(400, "Ruta de OSRM no permitida: solo route|table/v1/driving/<lng,lat;…>")
    puntos = m.group(2).split(";")
    if len(puntos) > MAX_PUNTOS:
        raise HttpError(400, f"Máximo {MAX_PUNTOS} puntos por consulta")
    lng, lat = (float(x) for x in puntos[0].split(","))
    base = matriz_distancias.url_de(region_de_punto(lat, lng))
    if not base:
        raise HttpError(503, "No hay OSRM para la región de esos puntos")
    params = {k: v for k, v in (consulta or {}).items() if k in _PARAMETROS and _VALOR.match(str(v))}
    url = f"{base.rstrip('/')}/{ruta}" + (f"?{urllib.parse.urlencode(params, safe=';,')}" if params else "")
    try:
        with urllib.request.urlopen(url, timeout=TIMEOUT_S) as res:
            return res.status, res.read()
    except urllib.error.HTTPError as e:  # OSRM responde 400 con su propio JSON (p. ej. NoRoute)
        return e.code, e.read()
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        raise HttpError(502, f"OSRM no respondió: {type(e).__name__}") from e
