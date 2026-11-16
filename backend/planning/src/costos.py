"""Costo de cada camión para el motor de ruteo (fase 6), desde las tablas de costeo.

Por tipo de camión (`tbl_tipos_camion`: t1, t3, t5) en colones de Costa Rica:
- por km  = mantenimiento por km (`vw_costo_variable_por_km`, suma de componentes)
            + diésel (`precio_diesel` / `km_por_litro` del tipo);
- por día = costo fijo mensual sin ayudante (`vw_costo_fijo_mensual`) / `dias_operativos`.

Un camión toma el tipo más chico cuya capacidad alcanza su capacidad de peso (si ninguno
alcanza, el más grande). Un camión de un transportista TERCERO cuesta lo mismo que el
propio equivalente × `FACTOR_TERCERO`: aproximación hasta conectar el tarifario de cada
transportista (pendiente). Solo hay datos de Costa Rica: en otra región devuelve None y
el motor sigue con su costo fijo por viaje en km.
"""

import logging
import os

from tms_common import pg

MODO_FIJO = "fijo"
MODO_REALES = "reales"
# ponytail: recargo de un tercero sobre el costo propio equivalente; reemplazar por la tarifa
# real del transportista (tarifas_rate_tables) cuando el tarifario se conecte al ruteo.
FACTOR_TERCERO = 1.3

_TIPOS = "SELECT codigo, capacidad_kg::float AS kg, km_por_litro::float AS kml FROM tbl_tipos_camion ORDER BY capacidad_kg"
_VARIABLE = "SELECT codigo_camion AS codigo, sum(costo_por_km)::float AS km FROM vw_costo_variable_por_km GROUP BY codigo_camion"
_FIJO = "SELECT codigo_camion AS codigo, fijo_sin_ayudante::float AS mes FROM vw_costo_fijo_mensual"
_PARAMETROS = "SELECT clave, valor::float AS valor FROM tbl_parametros_globales WHERE clave IN ('precio_diesel', 'dias_operativos')"

log = logging.getLogger(__name__)
_cache: dict | None = None


def modo() -> str:
    return MODO_REALES if os.environ.get("COSTOS_MODO", "").strip().lower() == MODO_REALES else MODO_FIJO


def usar_terceros() -> bool:
    """USAR_TERCEROS=si: el solver puede usar camiones de transportistas terceros del país
    cuando la flota propia ya tiene viaje ese día (antes que repetir un camión propio)."""
    return os.environ.get("USAR_TERCEROS", "").strip().lower() in ("si", "sí", "1", "true")


def _tarifas_por_tipo() -> list[dict]:
    """[{codigo, kg, km, dia}] ordenado por capacidad. Se lee una vez por arranque de la Lambda."""
    global _cache
    if _cache is None:
        variable = {r["codigo"]: r["km"] for r in pg.query(_VARIABLE)}
        fijo = {r["codigo"]: r["mes"] for r in pg.query(_FIJO)}
        p = {r["clave"]: r["valor"] for r in pg.query(_PARAMETROS)}
        diesel, dias = p.get("precio_diesel"), p.get("dias_operativos") or 30
        tipos = []
        for t in pg.query(_TIPOS):
            if t["codigo"] in variable and t["codigo"] in fijo and diesel and t["kml"]:
                tipos.append({"codigo": t["codigo"], "kg": t["kg"], "km": variable[t["codigo"]] + diesel / t["kml"],
                              "dia": fijo[t["codigo"]] / dias})
        _cache = {"tipos": tipos}
    return _cache["tipos"]


def tipo_de(capacidad_kg: float, tipos: list[dict]) -> dict:
    return next((t for t in tipos if t["kg"] >= capacidad_kg), tipos[-1])


def por_vehiculo(flota: list[dict], region: str | None, forzar: bool = False) -> dict | None:
    """{vehicle_id: {"tipo", "km", "dia"}} en colones, o None si no aplica (modo fijo, región sin
    datos, tablas vacías o error al leerlas: el motor sigue con el costo fijo en km).
    `forzar` ignora el modo (la comparación de motores mide costos aunque estén apagados)."""
    if (modo() != MODO_REALES and not forzar) or region != "CR" or not flota:
        return None
    try:
        tipos = _tarifas_por_tipo()
    except Exception:  # noqa: BLE001 — sin costos se planifica igual, con el costo fijo por viaje
        log.exception("costos: no se pudieron leer las tablas de costeo; se usa el costo fijo por viaje")
        return None
    if not tipos:
        return None
    costos = {}
    for c in flota:
        t = tipo_de(c["cw"], tipos)
        factor = 1.0 if c.get("propio", True) else FACTOR_TERCERO
        costos[c["id"]] = {"tipo": t["codigo"], "km": round(t["km"] * factor, 2), "dia": round(t["dia"] * factor, 2)}
    return costos
