"""Devoluciones: recepción por viaje y formularios de devolución (/api/v1/devoluciones/*).

Un viaje (ruta) con devoluciones solo queda listo para liquidar cuando TODAS están recibidas. Quien recibe es
el rol "Devoluciones" (permiso `devoluciones`: view para leer, edit para recibir y llenar formularios).

Un viaje puede tener VARIOS formularios: cada uno lleva solo las devoluciones que se marcaron al crearlo, y una
devolución va en un único formulario.
"""

import base64
import json
from datetime import date, datetime, timezone
from uuid import UUID
import re

from tms_common import audit, pg, permissions
from tms_common.errors import HttpError
from tms_common.event import json_body, path_param, query_params
from tms_common.responses import json_response

import admin_media
import admin_returns_sql as sql

MODULE = "devoluciones"
CONDITIONS = ("Bueno", "Dañado", "Incompleto")
RETURN_KINDS = ("devolucion", "reparacion", "cambio")
STATES = ("pendientes", "recibidos", "todos", "novedades")
FORM_NUMBER_ATTEMPTS = 3
MAX_FORM_RETURNS = 500
MAX_TRIPS_PAGE = 500
FORM_TEXT_LIMITS = {"physical_receipt_number": 50, "branch": 100, "merchandise_for": 255, "transport": 255,
                    "guide_number": 100, "received_by_name": 255}
SECTION_TEXT_LIMITS = {"invoice_number": 100, "customer_code": 100, "customer_name": 255, "phone": 50,
                       "route_label": 100}


def _ok(data: object) -> dict:
    return json_response(200, {"data": data, "error": None})


def _caller(event: dict, action: str) -> tuple[permissions.Permissions, str]:
    caller = permissions.for_event(event)
    caller.require(MODULE, action)
    rows = pg.query(sql.ORGANIZATION_SQL, [caller.app_user_id])
    if not rows:
        raise HttpError(401, "No existe app_user para este usuario autenticado.")
    return caller, str(rows[0]["organization_id"])


_UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.IGNORECASE)


def _scope(caller: permissions.Permissions, column: str = "country_id") -> tuple[str, list]:
    """Filtro por país del rol: None = todos; tupla (posiblemente vacía) = solo esos."""
    countries = caller.country_filter
    if countries is None:
        return "", []
    return f" AND {column} = ANY(%s::uuid[])", [list(countries)]


def _country_filter(country_id: str | None) -> tuple[str, list]:
    """Filtro opcional por país activo en la interfaz."""
    if not country_id:
        return "", []
    cid = country_id.strip()
    if not _UUID.match(cid):
        raise HttpError(400, "pais debe ser un UUID válido.")
    return " AND country_id = %s::uuid", [cid]


def _trip(caller: permissions.Permissions, org: str, route_id: str) -> dict:
    scope, extra = _scope(caller)
    rows = pg.query(sql.TRIP_SQL.format(scope=scope), [route_id, org, *extra])
    if not rows:
        raise HttpError(404, "Viaje no encontrado o sin devoluciones.")
    return rows[0]


def _text(body: dict, key: str, limit: int) -> str | None:
    value = str(body.get(key) or "").strip()
    if len(value) > limit:
        raise HttpError(400, f'"{key}" admite hasta {limit} caracteres.')
    return value or None


def _iso_date(value: object, label: str) -> date | None:
    if value in (None, ""):
        return None
    try:
        return date.fromisoformat(str(value))
    except ValueError as err:
        raise HttpError(400, f'{label} debe ser una fecha AAAA-MM-DD.') from err


def _body(event: dict) -> dict:
    body = json_body(event)
    return body if isinstance(body, dict) else {}


def _transport(trip: dict) -> str | None:
    return " - ".join(part for part in (trip.get("carrier_name"), trip.get("driver_name")) if part) or None


# ── Lecturas ──────────────────────────────────────────────────────────────────────────────────

def summary(event: dict) -> dict:
    caller, org = _caller(event, "view")
    params = query_params(event)
    country_sql, country_val = _country_filter(params.get("pais"))
    scope, extra = _scope(caller)
    return _ok(pg.query(sql.SUMMARY_SQL.format(filters=country_sql, scope=scope), [org, *country_val, *extra])[0])


def _trips_cursor(raw: str) -> list:
    """Clave de la última fila recibida: fecha/número opcionales y UUID de desempate."""
    try:
        if not isinstance(raw, str) or len(raw) > 2048:
            raise ValueError()
        values = json.loads(base64.b64decode(raw + "=" * (-len(raw) % 4), altchars=b"-_", validate=True))
        if not isinstance(values, list) or len(values) != 3:
            raise ValueError()
        day, number, route_id = values
        if day is not None and (not isinstance(day, str) or len(day) != 10):
            raise ValueError()
        if number is not None and (not isinstance(number, str) or len(number) > 255):
            raise ValueError()
        if number is not None:
            if "\x00" in number:
                raise ValueError()
            number.encode("utf-8")
        if not isinstance(route_id, str):
            raise ValueError()
        parsed_day = date.fromisoformat(day) if day is not None else date.min
        return [day is None, parsed_day, number is None, number or "", str(UUID(route_id))]
    except (ValueError, TypeError, UnicodeDecodeError) as error:
        raise HttpError(400, "cursor de viajes inválido.") from error


def _next_trips_cursor(row: dict) -> str:
    day = row.get("route_date")
    values = [day.isoformat() if isinstance(day, date) else day, row.get("route_number"), str(row["route_id"])]
    return base64.urlsafe_b64encode(json.dumps(values, ensure_ascii=False).encode("utf-8")).decode("ascii").rstrip("=")


def list_trips(event: dict) -> dict:
    caller, org = _caller(event, "view")
    params = query_params(event)
    state = params.get("estado") or "todos"
    if state not in STATES:
        raise HttpError(400, f"estado debe ser uno de: {', '.join(STATES)}")
    raw_limit = params.get("limit", str(MAX_TRIPS_PAGE))
    if not isinstance(raw_limit, str) or len(raw_limit) > 3 or not raw_limit.isdecimal() or not 1 <= int(raw_limit) <= MAX_TRIPS_PAGE:
        raise HttpError(400, f"limit debe ser un entero entre 1 y {MAX_TRIPS_PAGE}.")
    limit = int(raw_limit)
    filters, values = "", [org]
    if state == "pendientes":
        filters += " AND open_returns > 0"
    elif state == "recibidos":
        filters += " AND pending_returns = 0"
    elif state == "novedades":
        filters += " AND incident_returns > 0"
    since, until = _iso_date(params.get("desde"), "desde"), _iso_date(params.get("hasta"), "hasta")
    if since:
        filters, values = filters + " AND route_date >= %s", [*values, since]
    if until:
        filters, values = filters + " AND route_date <= %s", [*values, until]
    if "cursor" in params:
        cursor_values = _trips_cursor(params["cursor"])
        filters += f" AND {sql.TRIP_SORT_KEY} < (%s::boolean, %s::date, %s::boolean, %s::text, %s::uuid)"
        values.extend(cursor_values)
    country_sql, country_val = _country_filter(params.get("pais"))
    filters += country_sql
    values.extend(country_val)
    scope, extra = _scope(caller)
    rows = pg.query(sql.TRIPS_SQL.format(filters=filters, scope=scope), [*values, *extra, limit + 1])
    items = rows[:limit]
    cursor = _next_trips_cursor(items[-1]) if len(rows) > limit else None
    # data sigue siendo un array para los consumidores anteriores; el cursor es metadata adicional.
    return json_response(200, {"data": items, "error": None, "next_cursor": cursor})


def get_trip(event: dict) -> dict:
    """Devoluciones del viaje (cada una con el formulario que ya la lleva, si alguno), borrador de secciones
    desde tracking y la lista de formularios del viaje."""
    caller, org = _caller(event, "view")
    route_id = path_param(event, "routeId")
    trip = _trip(caller, org, route_id)
    return _ok({
        "trip": trip,
        "returns": [{**line, "photo_url": admin_media.signed_photo_url(line.get("photo_url"))}
                    for line in pg.query(sql.RETURNS_SQL, [route_id, org])],
        "sections": pg.query(sql.SECTIONS_SQL, [route_id, org]),
        "forms": pg.query(sql.FORMS_SQL, [route_id, org]),
        "defaults": {"transport": _transport(trip)},
    })


def _form_view(caller: permissions.Permissions, org: str, form: dict) -> dict:
    form_id = str(form["id"])
    trip = _trip(caller, org, str(form["route_id"]))
    return {
        "trip": trip,
        "form": form,
        "returns": pg.query(sql.FORM_RETURNS_SQL, [form_id, org]),
        "sections": pg.query(sql.FORM_SECTIONS_SQL, [form_id, org, form_id]),
        "defaults": {"transport": _transport(trip)},
    }


def _form(org: str, form_id: str) -> dict:
    rows = pg.query(sql.FORM_BY_ID_SQL, [form_id, org])
    if not rows:
        raise HttpError(404, "Formulario no encontrado.")
    return rows[0]


def get_form(event: dict) -> dict:
    caller, org = _caller(event, "view")
    return _ok(_form_view(caller, org, _form(org, path_param(event, "formId"))))


# ── Recepción ─────────────────────────────────────────────────────────────────────────────────

def _condition(body: dict) -> str:
    value = str(body.get("condition") or CONDITIONS[0])
    if value not in CONDITIONS:
        raise HttpError(400, f"condition debe ser una de: {', '.join(CONDITIONS)}")
    return value


def receive_return(event: dict) -> dict:
    caller, org = _caller(event, "edit")
    return_id, body = path_param(event, "returnId"), _body(event)
    scope, extra = _scope(caller, "s.country_id")
    rows = pg.query(sql.RETURN_SQL.format(scope=scope), [return_id, org, *extra])
    if not rows:
        raise HttpError(404, "Devolución no encontrada.")
    current = rows[0]
    quantity = body.get("received_quantity", current["quantity"])
    if isinstance(quantity, bool) or not isinstance(quantity, int) or not 0 <= quantity <= 2147483647:
        raise HttpError(400, "received_quantity debe ser un entero entre 0 y 2147483647.")
    if current["status"] == "received":
        received = None  # ya estaba recibida: es idempotente, no se pisa quién ni cuándo
    elif current["status"] not in ("pending", "approved"):
        raise HttpError(409, f'Una devolución en estado "{current["status"]}" no se puede recibir.')
    else:
        condition = _condition(body)
        if condition != 'Bueno' or (current['quantity'] is not None and quantity != current['quantity']):
            raise HttpError(400,'Para mercancía incompleta, averiada o con diferencia de cantidad, registre una novedad con su explicación.')
        updated = pg.query(sql.RECEIVE_SQL, [caller.app_user_id, quantity, condition, return_id, org])
        if not updated:
            raise HttpError(409, "La devolución cambió de estado; recarga e inténtalo de nuevo.")
        received = updated[0]
        audit.record(event, "update", module_key=MODULE, entity_table="tbl_returns", entity_id=return_id,
                     metadata={"action": "recibir", "received_quantity": quantity})
    return _ok({"return": received, "trip": _trip(caller, org, str(current["route_id"]))})


def receive_all(event: dict) -> dict:
    caller, org = _caller(event, "edit")
    route_id = path_param(event, "routeId")
    _trip(caller, org, route_id)
    condition = _condition(_body(event))
    if condition != 'Bueno':
        raise HttpError(400,'Registre las devoluciones incompletas o averiadas como novedades individuales con su explicación.')
    updated = pg.query(sql.RECEIVE_ALL_SQL, [caller.app_user_id, condition, route_id, org])
    if updated:
        audit.record(event, "update", module_key=MODULE, entity_table="tbl_routes", entity_id=route_id,
                     metadata={"action": "recibir-todas", "received": len(updated)})
    return _ok({"received": len(updated), "trip": _trip(caller, org, route_id)})


def reject_return(event: dict) -> dict:
    caller, org = _caller(event, "edit")
    return_id, body = path_param(event, "returnId"), _body(event)
    scope, extra = _scope(caller, "s.country_id")
    rows = pg.query(sql.RETURN_SQL.format(scope=scope), [return_id, org, *extra])
    if not rows:
        raise HttpError(404, "Devolución no encontrada.")
    current = rows[0]
    reason = str(body.get("reason") or "").strip()
    if not reason:
        raise HttpError(400, "El motivo de rechazo es obligatorio.")
    if len(reason) > 500:
        raise HttpError(400, "El motivo admite hasta 500 caracteres.")
    if current["status"] in ("received", "completed", "in_review"):
        raise HttpError(409, f'Una devolución en estado "{current["status"]}" no se puede rechazar.')
    if current["status"] in ("rejected", "cancelled"):
        rejected = None  # Idempotente
    else:
        updated = pg.query(sql.REJECT_SQL, [reason, caller.app_user_id, return_id, org])
        if not updated:
            raise HttpError(409, "La devolución cambió de estado; recarga e inténtalo de nuevo.")
        rejected = updated[0]
        audit.record(event, "update", module_key=MODULE, entity_table="tbl_returns", entity_id=return_id,
                     metadata={"action": "rechazar", "reason": reason})
    return _ok({"return": rejected, "trip": _trip(caller, org, str(current["route_id"]))})


# ── Formularios ───────────────────────────────────────────────────────────────────────────────

def _sections(body: dict, allowed_guides: set[str]) -> list[tuple]:
    raw = body.get("sections") or []
    if not isinstance(raw, list):
        raise HttpError(400, '"sections" debe ser una lista.')
    rows = []
    for position, item in enumerate(raw):
        if not isinstance(item, dict) or str(item.get("dispatch_guide_id")) not in allowed_guides:
            raise HttpError(400, "Cada sección debe ser de una parada con devoluciones de este formulario.")
        texts = [_text(item, key, limit) for key, limit in SECTION_TEXT_LIMITS.items()]
        address, sellers = str(item.get("address") or "").strip() or None, str(item.get("sellers") or "").strip() or None
        rows.append((str(item["dispatch_guide_id"]), position, texts[0], texts[1], texts[2], texts[3], address,
                     texts[4], sellers))
    return rows


def _form_fields(body: dict) -> list:
    kind = str(body.get("return_kind") or RETURN_KINDS[0])
    if kind not in RETURN_KINDS:
        raise HttpError(400, f"return_kind debe ser uno de: {', '.join(RETURN_KINDS)}")
    texts = {key: _text(body, key, limit) for key, limit in FORM_TEXT_LIMITS.items()}
    return [texts["physical_receipt_number"], texts["branch"], kind, texts["merchandise_for"],
            str(body.get("observations") or "").strip() or None, texts["transport"], texts["guide_number"],
            str(body.get("comments") or "").strip() or None, texts["received_by_name"],
            _iso_date(body.get("received_date"), "received_date")]


def _next_form_number(run, org: str) -> str:
    now = datetime.now(timezone.utc)
    prefix = f"DEV-{now:%Y-%m}-"
    return f"{prefix}{run(sql.NEXT_FORM_NUMBER_SQL, [org, prefix])[0]['next']:04d}"


def _return_ids(body: dict) -> list[str]:
    raw = body.get("return_ids")
    if not isinstance(raw, list) or not raw:
        raise HttpError(400, "Marca al menos una devolución para crear el formulario.")
    ids = list(dict.fromkeys(str(item) for item in raw))
    if len(ids) > MAX_FORM_RETURNS:
        raise HttpError(400, f"Un formulario admite hasta {MAX_FORM_RETURNS} devoluciones.")
    return ids


def create_form(event: dict) -> dict:
    """Formulario nuevo SOLO con las devoluciones marcadas (`return_ids`). Una devolución va en un solo formulario."""
    caller, org = _caller(event, "edit")
    route_id, body = path_param(event, "routeId"), _body(event)
    _trip(caller, org, route_id)
    ids = _return_ids(body)
    chosen = pg.query(sql.SELECTED_RETURNS_SQL, [route_id, org, ids])
    if len(chosen) != len(ids):
        raise HttpError(400, "Alguna devolución marcada no es de este viaje.")
    taken = [row for row in chosen if row["form_id"] is not None]
    if taken:
        raise HttpError(409, f"{len(taken)} devolución(es) marcada(s) ya van en otro formulario; desmárcalas.")
    if any(row.get('status') == 'in_review' for row in chosen):
        raise HttpError(409, 'Una devolución en revisión no puede añadirse a un formulario hasta su aceptación interna.')
    fields = _form_fields(body)
    sections = _sections(body, {str(row["dispatch_guide_id"]) for row in chosen})

    with pg.transaction() as run:
        # Comparte el bloqueo de la devolución con el registro de novedades.
        locked = run(sql.SELECTED_RETURNS_SQL + ' ORDER BY rt.id FOR UPDATE OF rt', [route_id, org, ids])
        if len(locked) != len(ids) or any(row.get('status') == 'in_review' or row['form_id'] is not None for row in locked):
            raise HttpError(409, 'Una devolución marcada cambió de estado o ya pertenece a otro formulario; recargue la lista.')
        saved = []
        for _ in range(FORM_NUMBER_ATTEMPTS):
            number = _next_form_number(run, org)
            saved = run(sql.INSERT_FORM_SQL, [org, route_id, number, *fields, caller.app_user_id])
            if saved:
                break
        if not saved:
            raise HttpError(409, "No se pudo generar el número del formulario; inténtalo de nuevo.")
        form_id = saved[0]["id"]
        for return_id in ids:
            run(sql.INSERT_ITEM_SQL, [form_id, return_id])  # unique(return_id): otra persona se adelantó -> 409
        for guide_id, position, invoice, code, name, phone, address, label, sellers in sections:
            run(sql.UPSERT_SECTION_SQL, [form_id, guide_id, position, invoice, code, name, phone, address, label, sellers])
    audit.record(event, "create", module_key=MODULE, entity_table="tbl_return_forms", entity_id=str(form_id),
                 metadata={"route_id": route_id, "form_number": saved[0]["form_number"], "returns": len(ids)})
    return _ok(_form_view(caller, org, _form(org, str(form_id))))


def update_form(event: dict) -> dict:
    """Edita los datos del formulario y sus secciones. Las devoluciones que lleva no cambian."""
    caller, org = _caller(event, "edit")
    form_id, body = path_param(event, "formId"), _body(event)
    form = _form(org, form_id)
    _trip(caller, org, str(form["route_id"]))
    fields = _form_fields(body)
    allowed = {str(row["id"]) for row in pg.query(sql.FORM_GUIDE_IDS_SQL, [form_id])}
    sections = _sections(body, allowed)

    with pg.transaction() as run:
        if not run(sql.UPDATE_FORM_SQL, [*fields, form_id, org]):
            raise HttpError(404, "Formulario no encontrado.")
        for guide_id, position, invoice, code, name, phone, address, label, sellers in sections:
            run(sql.UPSERT_SECTION_SQL, [form_id, guide_id, position, invoice, code, name, phone, address, label, sellers])
    audit.record(event, "update", module_key=MODULE, entity_table="tbl_return_forms", entity_id=form_id,
                 metadata={"route_id": str(form["route_id"]), "form_number": form["form_number"]})
    return _ok(_form_view(caller, org, _form(org, form_id)))
