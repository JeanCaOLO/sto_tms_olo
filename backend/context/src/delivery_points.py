"""Alta, edición y baja atómicas de puntos de entrega (/api/v1/delivery-points).

Un punto toca tres tablas (final_customers, addresses, delivery_points): desde
el navegador por /api/data serían tres escrituras sueltas. Aquí van en una
transacción, con la acción del módulo `puntos_entrega` de la matriz de
permisos (sql/15) y la autorización por scope del cliente dueño.
La LISTA sigue por la API genérica (ver backend/README.md).
"""

from tms_common import permissions, pg
from tms_common.errors import HttpError
from tms_common.event import auth_user, json_body, path_param
from tms_common.responses import json_response

import delivery_points_sql as sql
from scopes import authorize

ADDRESS_FIELDS = ("line1", "line2", "city", "state")
POINT_FIELDS = ("name", "delivery_instructions", "zone_id", "route_code", "active")
GEO_OK, GEO_PENDING = "OK", "PENDING"
LAT_RANGE, LON_RANGE = (-90.0, 90.0), (-180.0, 180.0)
MODULE = "puntos_entrega"


def _require(event: dict, action: str, country_id: object = None) -> None:
    caller = permissions.for_event(event)
    caller.require(MODULE, action)
    allowed = caller.country_filter
    if allowed is not None and country_id is not None and str(country_id) not in allowed:
        raise HttpError(403, "Tu rol no tiene acceso a ese país.")


def _ok(row: dict) -> dict:
    return json_response(200, {"data": row, "error": None})


def _body(event: dict) -> dict:
    body = json_body(event)
    return body if isinstance(body, dict) else {}


def _required(body: dict, key: str, label: str) -> str:
    value = str(body.get(key) or "").strip()
    if not value:
        raise HttpError(400, f"{label} es obligatorio")
    return value


def _coordinate(value: object, bounds: tuple[float, float], label: str) -> float | None:
    if value in (None, ""):
        return None
    try:
        number = float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError) as err:
        raise HttpError(400, f"{label} debe ser numérica") from err
    if not bounds[0] <= number <= bounds[1]:
        raise HttpError(400, f"{label} fuera de rango")
    return number


def _address_values(address: dict) -> list:
    lat = _coordinate(address.get("latitude"), LAT_RANGE, "La latitud")
    lon = _coordinate(address.get("longitude"), LON_RANGE, "La longitud")
    if (lat is None) != (lon is None):
        raise HttpError(400, "Latitud y longitud van juntas (las dos o ninguna)")
    status = GEO_OK if lat is not None else GEO_PENDING
    texts = [str(address.get(field) or "").strip() or None for field in ADDRESS_FIELDS]
    return [*texts, lat, lon, status, status]


def _point(point_id: str) -> dict:
    rows = pg.query(sql.POINT_SQL, [point_id])
    if not rows:
        raise HttpError(404, "Punto de entrega no encontrado")
    return rows[0]


def _final_customer(run: pg.Runner, customer_id: str, code: str, name: str) -> str:
    found = run(sql.FIND_FINAL_CUSTOMER_SQL, [customer_id, code])
    if found:
        return str(found[0]["id"])
    return str(run(sql.INSERT_FINAL_CUSTOMER_SQL, [customer_id, code, name])[0]["id"])


def create_point(event: dict) -> dict:
    body = _body(event)
    customer_id = _required(body, "customer_id", "El cliente")
    authorize(auth_user(event), customer_id=customer_id)
    code, name = _required(body, "external_code", "El código"), _required(body, "name", "El nombre")
    address = _address_values(body.get("address") or {})
    country = pg.query(sql.CUSTOMER_COUNTRY_SQL, [customer_id])[0]["country_id"]
    _require(event, "create", country)
    with pg.transaction() as run:
        fc_id = _final_customer(run, customer_id, code, name)
        if run(sql.POINT_EXISTS_SQL, [fc_id, code]):
            raise HttpError(409, f'El cliente ya tiene un punto de entrega con código "{code}".')
        address_id = run(sql.INSERT_ADDRESS_SQL, [country, *address])[0]["id"]
        point_id = run(sql.INSERT_POINT_SQL, [fc_id, address_id, code, name, body.get("delivery_instructions"),
                                             body.get("zone_id") or None, body.get("route_code") or None, fc_id])[0]["id"]
    return _ok(_point(str(point_id)))


def _authorized_point(event: dict, action: str) -> dict:
    point = _point(path_param(event, "id"))
    _require(event, action, point.get("country_id"))
    authorize(auth_user(event), customer_id=str(point["customer_id"]))
    return point


def update_point(event: dict) -> dict:
    point, body = _authorized_point(event, "edit"), _body(event)
    fields = {key: (body[key] or None) if key != "active" else bool(body[key]) for key in POINT_FIELDS if key in body}
    if "name" in fields and not fields["name"]:
        raise HttpError(400, "El nombre es obligatorio")
    with pg.transaction() as run:
        if fields:
            assignments = ", ".join(f"{column} = %s" for column in fields)
            run(f"UPDATE delivery_points SET {assignments}, updated_at = now() WHERE id = %s",
                [*fields.values(), point["id"]])
        if isinstance(body.get("address"), dict) and point["address_id"]:
            run(sql.UPDATE_ADDRESS_SQL, [*_address_values(body["address"]), point["address_id"]])
    return _ok(_point(str(point["id"])))


def delete_point(event: dict) -> dict:
    point = _authorized_point(event, "delete")
    with pg.transaction() as run:
        run(sql.DELETE_POINT_SQL, [point["id"]])
        if point["address_id"]:
            run(sql.DELETE_ADDRESS_SQL, [point["address_id"]])
    return _ok({"id": str(point["id"])})
