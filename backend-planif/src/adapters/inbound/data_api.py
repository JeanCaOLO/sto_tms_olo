"""Adaptador inbound HTTP API → casos de uso de la API genérica de datos.

Contrato idéntico al de `origin/main:backend/data/src/app.py`: /api/data/{table}
con GET/POST/PATCH/DELETE, misma forma de respuesta ({data, error, [count]}) y
mismos parámetros (select, filters, order, limit, single, maybeSingle, head,
count, returning). Requiere el JWT (Lambda authorizer). Un único
`tms_handler(ROUTES)` cubre los cuatro verbos.
"""

from __future__ import annotations

from app import wiring
from lib.tms_common.event import json_body, parse_json_param, path_param, query_params
from lib.tms_common.handler import tms_handler
from lib.tms_common.responses import json_response


def _body(event: dict) -> dict:
    body = json_body(event)
    return body if isinstance(body, dict) else {}


# GET /api/data/{table}
def list_rows(event: dict) -> dict:
    params = query_params(event)
    filters = parse_json_param(params.get("filters"), "filters") or []
    order = parse_json_param(params.get("order"), "order")
    result = wiring.build_data_service().list_rows(event, path_param(event, "table"), params, filters, order)
    return json_response(200, result)


# POST /api/data/{table}
def insert_rows(event: dict) -> dict:
    result = wiring.build_data_service().insert_rows(event, path_param(event, "table"), _body(event))
    return json_response(200, result)


# PATCH /api/data/{table}
def update_rows(event: dict) -> dict:
    result = wiring.build_data_service().update_rows(event, path_param(event, "table"), _body(event))
    return json_response(200, result)


# DELETE /api/data/{table}
def delete_rows(event: dict) -> dict:
    result = wiring.build_data_service().delete_rows(event, path_param(event, "table"), _body(event))
    return json_response(200, result)


ROUTES = {
    "GET /api/data/{table}": list_rows,
    "POST /api/data/{table}": insert_rows,
    "PATCH /api/data/{table}": update_rows,
    "DELETE /api/data/{table}": delete_rows,
}

handler = tms_handler(ROUTES)
