"""Costo de cada camión para el motor de ruteo (fase 6), desde las tablas de costeo.

Por tipo de camión (`tbl_tipos_camion`: t1, t3, t5) en colones de Costa Rica:
- por km  = mantenimiento por km (`vw_costo_variable_por_km`, suma de componentes)
            + diésel (`precio_diesel` / `km_por_litro` del tipo);
- por día = costo fijo mensual sin ayudante (`vw_costo_fijo_mensual`) / `dias_operativos`.

Un camión toma el tipo más chico cuya capacidad alcanza su capacidad de peso (si ninguno
alcanza, el más grande). Solo hay tablas de costeo de Costa Rica: en otra región devuelve
None y el motor sigue con su costo fijo por viaje en km.

Un camión de un transportista TERCERO cuesta lo que dice su TARIFARIO (`tarifas_terceros`):
la regla BASE de su transportista que corresponde a su `rate_type`. Sin tarifa cargada,
cuesta el propio equivalente × `FACTOR_TERCERO`.

Forma del costo de un camión (colones): `km` por km recorrido, `dia` la primera vez que sale
en el día (propios), `viaje` por cada viaje (terceros), `parada` por cada cliente atendido
(terceros por parada) y `por_zona` {zona: monto por viaje} (tabla zona × camión).
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


# Reglas BASE activas del tarifario de cada transportista (tbl_tarifas_*, liquidaciones).
_REGLAS_BASE = """
SELECT ca.id::text AS carrier, ca.rate_type, sp.id AS party, r.code, r.base_method, r.expression
FROM tbl_carriers ca
JOIN tbl_tarifas_settlement_parties sp ON sp.carrier_id = ca.id
JOIN tbl_tarifas_pricing_rules r ON r.party_id = sp.id AND r.active AND upper(r.stage) = 'BASE'
WHERE ca.id::text = ANY(%s)
ORDER BY r.priority, r.code"""
_TABLAS = """
SELECT t.party_id AS party, t.code, r.key, r.amount::float AS amount
FROM tbl_tarifas_rate_tables t JOIN tbl_tarifas_rate_table_rows r ON r.table_id = t.id AND r.active
WHERE t.party_id = ANY(%s) AND t.active"""
# rate_type del transportista → base_method de la regla que se usa. Sin rate_type (o TENDERING,
# que se adjudica viaje a viaje): la tarifa fija por viaje y, si no hay, la de km.
_METODO = {"FIXED": ["FIXED"], "PER_KM": ["PER_KM"], "PER_UNIT": ["PER_UNIT"], "VOLUME": ["VOLUME"]}
_PREFERENCIA_SIN_TIPO = ["FIXED", "PER_KM", "PER_UNIT", "VOLUME"]


def _numero(x) -> float:
    try:
        return float(x)
    except (TypeError, ValueError):
        return 0.0


def _llave(clave) -> list:
    """[zona, tipo de camión] de una fila de tabla; lo que falte vale '*' (cualquiera)."""
    return (list(clave or []) + ["*", "*"])[:2]


def _costo_de_expresion(expr: dict, camion: dict, tablas: dict) -> dict | None:
    """Traduce una expresión BASE del tarifario a la forma de costo del motor (o None si no se
    sabe traducir: se prueba la siguiente regla o el factor)."""
    op = (expr or {}).get("op")
    if op == "FIXED":
        return {"km": 0.0, "viaje": _numero(expr.get("amount")), "parada": 0.0}
    if op == "PER_KM":
        return {"km": _numero(expr.get("rate")), "viaje": 0.0, "parada": 0.0}
    if op == "PER_UNIT" and expr.get("unit") == "clientCount":
        return {"km": 0.0, "viaje": 0.0, "parada": _numero(expr.get("rate"))}
    if op == "PER_UNIT" and expr.get("unit") == "truckVolumeM3":
        return {"km": 0.0, "viaje": _numero(expr.get("rate")) * (camion.get("cv") or 0.0), "parada": 0.0}
    if op == "LOOKUP_TABLE":
        base = _costo_de_expresion(expr.get("fallback") or {}, camion, tablas) or {"km": 0.0, "viaje": 0.0, "parada": 0.0}
        filas = tablas.get(expr.get("table"), [])
        tipo = camion.get("vehicle_type")
        por_zona: dict = {}
        exactas: set = set()
        for clave, monto in filas:
            zona, tipo_fila = _llave(clave)
            if zona == "*" or tipo_fila not in (tipo, "*"):
                continue
            if tipo_fila == tipo:  # la fila del tipo exacto gana sobre el comodín
                por_zona[zona] = monto
                exactas.add(zona)
            elif zona not in exactas:
                por_zona[zona] = monto
        comodin = next((m for c, m in filas if _llave(c) in (["*", tipo], ["*", "*"])), None)
        if comodin is not None:  # zona no listada: el monto de la fila comodín por viaje
            base = {"km": 0.0, "viaje": comodin, "parada": 0.0}
        return {**base, "por_zona": por_zona}
    return None


def tarifas_terceros(terceros: list[dict]) -> dict:
    """{vehicle_id: costo} de los camiones de terceros según su tarifario; los que no tienen
    tarifa traducible no aparecen (el llamador usa el factor). Cada costo lleva `fuente`."""
    if not terceros:
        return {}
    carriers = sorted({str(c["carrier_id"]) for c in terceros if c.get("carrier_id")})
    reglas = pg.query(_REGLAS_BASE, [carriers]) if carriers else []
    partes = sorted({r["party"] for r in reglas})
    tablas: dict = {}
    for f in (pg.query(_TABLAS, [partes]) if partes else []):
        tablas.setdefault((f["party"], f["code"]), []).append((f["key"], f["amount"]))
    por_carrier: dict = {}
    for r in reglas:
        por_carrier.setdefault(r["carrier"], []).append(r)
    costos = {}
    for c in terceros:
        suyas = por_carrier.get(str(c.get("carrier_id")), [])
        if not suyas:
            continue
        orden = _METODO.get((suyas[0]["rate_type"] or "").upper(), _PREFERENCIA_SIN_TIPO)
        candidatas = sorted((r for r in suyas if (r["base_method"] or "").upper() in orden),
                            key=lambda r: (orden.index(r["base_method"].upper()),
                                           0 if (r["expression"] or {}).get("op") == "LOOKUP_TABLE" else 1))
        for r in candidatas:
            tablas_party = {code: filas for (party, code), filas in tablas.items() if party == r["party"]}
            costo = _costo_de_expresion(r["expression"], c, tablas_party)
            if costo is not None:
                costos[c["id"]] = {**costo, "dia": 0.0, "tipo": "tercero", "fuente": f"tarifario:{r['code']}"}
                break
    return costos


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
    try:
        tarifados = tarifas_terceros([c for c in flota if not c.get("propio", True)])
    except Exception:  # noqa: BLE001 — sin tarifario los terceros cuestan el propio equivalente × factor
        log.exception("costos: no se pudo leer el tarifario de los terceros; se usa el factor")
        tarifados = {}
    costos = {}
    for c in flota:
        if c["id"] in tarifados:
            costos[c["id"]] = tarifados[c["id"]]
            continue
        t = tipo_de(c["cw"], tipos)
        if c.get("propio", True):
            costos[c["id"]] = {"tipo": t["codigo"], "km": round(t["km"], 2), "dia": round(t["dia"], 2),
                               "viaje": 0.0, "parada": 0.0, "fuente": "costeo"}
        else:  # tercero sin tarifa: el propio equivalente × factor, cobrado por viaje
            costos[c["id"]] = {"tipo": t["codigo"], "km": round(t["km"] * FACTOR_TERCERO, 2), "dia": 0.0,
                               "viaje": round(t["dia"] * FACTOR_TERCERO, 2), "parada": 0.0, "fuente": "factor"}
    return costos
