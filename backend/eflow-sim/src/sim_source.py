"""Fuente SIMULADA de EXPEDICIONESCABECERA/DETALLE (stand-in del API de ePrac).

Sirve filas de un seed en memoria y aplica los POST (update) encima. No toca
EFLOW real ni la tabla orders de Aurora: es solo para que planificacion/OMS
prueben el contrato mientras ePrac entrega el API formal.

ponytail: store en memoria (se reinicia al reiniciar el proceso); es un mock.
Upgrade path: el API real de ePrac reemplaza esta fuente sin tocar a los
consumidores (mismo contrato de params + shapes).
"""

import json
from pathlib import Path

from tms_common.errors import HttpError

SEED = Path(__file__).with_name("expediciones_seed.json")
# Claves que identifican una expedicion (cabecera y sus lineas) segun el PDF.
CLAVE = ("IDEXPEDICION", "IDCOMPANIA", "IDALMACEN", "IDSUCURSAL")


def _cargar() -> dict:
    data = json.loads(SEED.read_text(encoding="utf-8"))
    return {"cabecera": data["cabecera"], "detalle": data["detalle"]}


# Estado mutable del mock (los POST escriben aca).
_DB = _cargar()


def _coincide(row: dict, filtros: dict) -> bool:
    return all(str(row.get(k)) == str(v) for k, v in filtros.items())


def cabecera(filtros: dict) -> list[dict]:
    return [r for r in _DB["cabecera"] if _coincide(r, filtros)]


def detalle(filtros: dict) -> list[dict]:
    return [r for r in _DB["detalle"] if _coincide(r, filtros)]


def _clave_de(payload: dict) -> dict:
    faltan = [k for k in CLAVE if not payload.get(k)]
    if faltan:
        raise HttpError(400, f"faltan claves: {', '.join(faltan)}")
    return {k: str(payload[k]) for k in CLAVE}


def _actualizar(rows: list[dict], payload: dict, campos: tuple[str, ...]) -> dict:
    clave = _clave_de(payload)
    afectados = [r for r in rows if _coincide(r, clave)]
    if not afectados:
        raise HttpError(404, "registro no encontrado")
    for row in afectados:
        for campo in campos:
            if campo in payload:
                row[campo] = payload[campo]
    return {"status": "success", "message": "Updated", **clave}


def actualizar_cabecera(payload: dict) -> dict:
    return _actualizar(_DB["cabecera"], payload, ("TPEXES", "TPEXSI", "PRIORIDAD", "BAJADA"))


def actualizar_detalle(payload: dict) -> dict:
    return _actualizar(_DB["detalle"], payload, ("TPEXES", "TPEXSI", "PRIORIDAD"))
