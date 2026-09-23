"""Planificación: pedidos alistados por el OMS listos para armar viajes.

GET /api/v1/planificacion/pedidos?fecha_entrega=YYYY-MM-DD   (o ?dia=manana, el default)

Fuente: wms_expediciones (staging del WMS en Aurora). Alistado = situacion
'GENE' sin viaje WMH asignado; la fecha de entrega comprometida es
fecha_planificada (DECIDED: el OMS no escribe fechas, la lee del WMS).

GAP: wms_expediciones es el HEADER de la expedición y no trae peso/volumen;
esos salen de EXPEDICIONESCABECERA en EFLOW (hoy en modo mock). Se devuelven
como null con capacity_known = false, nunca como 0, para que el motor de
capacidad no asigne camiones con datos inventados.
"""

import re

from tms_common import pg
from tms_common.errors import HttpError
from tms_common.event import auth_user, query_params
from tms_common.handler import tms_handler
from tms_common.responses import json_response

from planning_sql import ORDERS_SQL

ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
TOMORROW = "manana"
TOMORROW_SQL = "(now() AT TIME ZONE 'America/Costa_Rica')::date + 1"


def _date_filter(params: dict) -> tuple[str, list]:
    raw = params.get("fecha_entrega")
    if raw is None:
        if params.get("dia", TOMORROW) != TOMORROW:
            raise HttpError(400, 'dia solo admite "manana"; para otra fecha usa fecha_entrega=YYYY-MM-DD')
        return TOMORROW_SQL, []
    if not ISO_DATE.match(raw):
        raise HttpError(400, "fecha_entrega debe tener formato YYYY-MM-DD")
    return "%s::date", [raw]


def _organization(event: dict) -> str:
    rows = pg.query("SELECT organization_id FROM app_users WHERE auth_user_id = %s", [auth_user(event)["id"]])
    if not rows:
        raise HttpError(401, "No existe app_user para este usuario autenticado.")
    return str(rows[0]["organization_id"])


def list_orders(event: dict) -> dict:
    date_sql, date_params = _date_filter(query_params(event))
    rows = pg.query(ORDERS_SQL.format(delivery_date=date_sql), [_organization(event), *date_params])
    return json_response(200, {"data": rows, "error": None})


ROUTES = {"GET /api/v1/planificacion/pedidos": list_orders}

handler = tms_handler(ROUTES)
