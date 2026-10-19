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

import json
import re

import plan_builder
import plans_read
from planning_sql import ORDERS_SQL
from tms_common import permissions, pg
from tms_common.errors import HttpError
from tms_common.event import auth_user, path_param, query_params
from tms_common.handler import tms_handler
from tms_common.responses import json_response

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


def _app_user(event: dict) -> dict:
    rows = pg.query("SELECT id, organization_id FROM app_users WHERE auth_user_id = %s", [auth_user(event)["id"]])
    if not rows:
        raise HttpError(401, "No existe app_user para este usuario autenticado.")
    return {"id": str(rows[0]["id"]), "org": str(rows[0]["organization_id"])}


def _organization(event: dict) -> str:
    return _app_user(event)["org"]


def _warehouse(event: dict) -> str | None:
    return (event.get("headers") or {}).get("x-warehouse-id") or None


def list_orders(event: dict) -> dict:
    permissions.for_event(event).require("planificacion", "view")
    date_sql, date_params = _date_filter(query_params(event))
    rows = pg.query(ORDERS_SQL.format(delivery_date=date_sql), [_organization(event), *date_params])
    return json_response(200, {"data": rows, "error": None})


def list_planes(event: dict) -> dict:
    permissions.for_event(event).require("planificacion", "view")
    return json_response(200, {"data": plans_read.listar(_organization(event), _warehouse(event)), "error": None})


def get_plan(event: dict) -> dict:
    permissions.for_event(event).require("planificacion", "view")
    plan = plans_read.obtener(_organization(event), path_param(event, "id"))
    if plan is None:
        raise HttpError(404, "plan no encontrado")
    return json_response(200, {"data": plan, "error": None})


def build_plan(event: dict) -> dict:
    permissions.for_event(event).require("planificacion", "edit")
    user = _app_user(event)
    warehouse = _warehouse(event)
    if not warehouse:
        raise HttpError(400, "Falta el almacén (x-warehouse-id) para planificar")
    fecha = (json.loads(event.get("body") or "{}")).get("plan_date")
    if not fecha or not ISO_DATE.match(fecha):
        raise HttpError(400, "plan_date debe tener formato YYYY-MM-DD")
    rows = pg.query("SELECT country_id FROM warehouses WHERE id = %s", [warehouse])
    if not rows:
        raise HttpError(400, "Almacén inexistente")
    plan_id = plan_builder.construir_y_persistir(user["org"], str(rows[0]["country_id"]), warehouse, fecha, user["id"])
    plan = plans_read.obtener(user["org"], plan_id) if plan_id else None
    return json_response(200, {"data": plan, "error": None})


ROUTES = {
    "GET /api/v1/planificacion/pedidos": list_orders,
    "GET /api/v1/planificacion/planes": list_planes,
    "GET /api/v1/planificacion/planes/{id}": get_plan,
    "POST /api/v1/planificacion/planes": build_plan,
}

handler = tms_handler(ROUTES)
