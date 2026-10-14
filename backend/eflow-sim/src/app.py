"""API SIMULADA de eFlow WMS (proveedor ePrac) — EXPEDICIONESCABECERA/DETALLE.

Stand-in del API que ePrac entregara formalmente (spec: ET-MS-OC26007 "OMS
Endpoints eFlow", v1.0 06/10/2026, Eduardo Medina / Ana Maria Maradey).
Mientras llega el real, planificacion y el OMS consumen ESTE con el mismo
contrato (params + shapes). Los datos salen de un seed en memoria (sim_source);
NO se extrae nada ni se escribe en la tabla orders.

Rutas publicas (sin token), igual que el modulo eflow: el cliente del frontend
llama sin authorizer. Swap: cuando ePrac entregue, se apunta el base URL al API
real y los consumidores no cambian.
"""

import json
import logging

from tms_common.errors import HttpError
from tms_common.event import query_params, route_key
from tms_common.handler import dispatch
from tms_common.responses import json_response

import sim_source

logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Params de filtro por endpoint (todos opcionales en la practica: sin filtros
# devuelve toda la tabla, como dice el PDF).
FILTROS_CABECERA = ("IDEXPEDICION", "IDCOMPANIA", "IDALMACEN", "IDSUCURSAL", "TPEXES", "TPEXSI", "PRIORIDAD", "BAJADA")
FILTROS_DETALLE = ("IDEXPEDICION", "IDCOMPANIA", "IDALMACEN", "IDSUCURSAL", "TPEXES", "TPEXSI", "PRIORIDAD")


def _ok(body: object) -> dict:
    return json_response(200, body, decimal_as=float)


def _filtros(event: dict, permitidos: tuple[str, ...]) -> dict:
    q = query_params(event)
    return {k: q[k] for k in permitidos if q.get(k) not in (None, "")}


def _body(event: dict) -> dict:
    try:
        return json.loads(event.get("body") or "{}")
    except json.JSONDecodeError as err:
        raise HttpError(400, "invalid_json") from err


def get_cabecera(event: dict) -> dict:
    return _ok(sim_source.cabecera(_filtros(event, FILTROS_CABECERA)))


def get_detalle(event: dict) -> dict:
    return _ok(sim_source.detalle(_filtros(event, FILTROS_DETALLE)))


def post_cabecera(event: dict) -> dict:
    return _ok(sim_source.actualizar_cabecera(_body(event)))


def post_detalle(event: dict) -> dict:
    return _ok(sim_source.actualizar_detalle(_body(event)))


ROUTES = {
    "GET /api/eflow-sim/expediciones-cabecera": get_cabecera,
    "GET /api/eflow-sim/expediciones-detalle": get_detalle,
    "POST /api/eflow-sim/expediciones-cabecera": post_cabecera,
    "POST /api/eflow-sim/expediciones-detalle": post_detalle,
}


def handler(event: dict, _context: object) -> dict:
    """Respuestas con el shape del PDF: errores { status: error, message }."""
    try:
        return dispatch(ROUTES, event)
    except HttpError as err:
        return json_response(err.status, {"status": "error", "message": str(err)})
    except Exception as err:  # noqa: BLE001 - frontera: nunca tumbar el proceso
        logger.exception("%s -> fallo eflow-sim", route_key(event))
        return json_response(500, {"status": "error", "message": str(err)})
