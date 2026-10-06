"""API del tarifador / liquidador: el backend del ORM del frontend.

Implementa el contrato de `src/lib/tarifas/data/http-datasource.ts`:

    GET    /api/tarifas/{table}?q={json}   -> Row[]   q = { where, orderBy, limit, offset }
    GET    /api/tarifas/{table}/{id}       -> Row | 404
    POST   /api/tarifas/{table}            -> Row      body = la fila
    PATCH  /api/tarifas/{table}/{id}       -> Row      body = campos a mezclar
    DELETE /api/tarifas/{table}/{id}       -> 204
    POST   /api/tarifas/tx                 -> Row[]    body = { ops: [...] }, todo o nada

`{table}` es el nombre de tabla (o vista) del registro de esquema; se valida
contra `schema_manifest.json` (ver `tarifas_schema.py`).

Reglas:
  - Entidades EXTERNAS (viajes, transportistas, conductores, vehículos, zonas,
    países): solo lectura; cualquier escritura es 405. Sus dueños son guía de
    despacho y el catálogo (ROADMAP §8).
  - Bitácora (`tarifas_audit_log`): append-only; update/delete es 405.
  - Permisos, en dos módulos de la matriz de roles (view / create / edit / delete):
      `tarifas`         liquidar: emitir, re-liquidar y cambiar el estado de una liquidación
                        (tablas `tarifas_settlements` y `tarifas_audit_log`), y leer todo lo que el
                        cálculo necesita;
      `tarifas.config`  configurar: reglas, tarifarios, costos, variables, margen, plantillas.
    Un rol de liquidación NO puede escribir configuración. Países: se filtra y se valida contra los
    países del rol.
  - Integridad: FK y unicidad las hace cumplir Postgres; llegan como 409 con el
    SQLSTATE en `error.code` (23503 / 23505).
"""

from tms_common import permissions, pg
from tms_common.errors import HttpError
from tms_common.event import json_body, parse_json_param, path_param, query_params
from tms_common.handler import tms_handler
from tms_common.responses import empty_response, json_response

import tarifas_perms
from tarifas_schema import Table, table as table_def
from tarifas_sql import build_delete, build_find, build_get, build_insert, build_update

MODULE = "tarifas"
CONFIG_MODULE = "tarifas.config"
# Lo único que escribe quien liquida; todo lo demás es configuración.
LIQUIDATION_TABLES = frozenset({"tarifas_settlements", "tarifas_audit_log", "tarifas_trip_order_marks"})
TX_RETRIES = 2  # reintentos ante deadlock (40P01) o fallo de serialización (40001)
TX_OPERATIONS = {"insert": "create", "update": "edit", "delete": "delete"}


def _write_module(table: Table) -> str:
    return MODULE if table.name in LIQUIDATION_TABLES else CONFIG_MODULE


def _reader(event: dict) -> permissions.Permissions:
    """Leer exige poder liquidar o poder configurar: el cálculo y pantallas de config leen lo mismo."""
    caller = tarifas_perms.for_event(event)
    if not (caller.can(MODULE, "view") or caller.can(CONFIG_MODULE, "view")):
        caller.require(MODULE, "view")
    return caller


def _writer(event: dict, table_name: str, action: str, operation: str) -> tuple[permissions.Permissions, Table]:
    caller = tarifas_perms.for_event(event)
    table = _writable(table_name, operation)
    caller.require(_write_module(table), action)
    return caller, table


def _table(name: str) -> Table:
    return table_def(name)


def _writable(name: str, operation: str) -> Table:
    table = _table(name)
    if table.read_only:
        raise HttpError(405, f"{table.label}: es un dato del TMS y el liquidador solo lo lee.")
    if table.append_only and operation in ("update", "delete"):
        raise HttpError(405, f"{table.label}: es append-only, no admite {operation}.")
    return table


def _require_country(caller: permissions.Permissions, table: Table, values: object) -> None:
    """No se escribe una fila de un país que el rol no ve."""
    allowed = caller.country_filter
    if allowed is None or not table.has_country or not isinstance(values, dict):
        return
    country = values.get("country_id")
    if country is not None and str(country) not in allowed:
        raise HttpError(403, "Tu rol no tiene acceso a ese país.")


def _body(event: dict) -> dict:
    body = json_body(event)
    if not isinstance(body, dict):
        raise HttpError(400, "El body debe ser un objeto JSON")
    return body


# ── Lectura ────────────────────────────────────────────────────────────────────────────────────

def list_rows(event: dict) -> dict:
    caller = _reader(event)
    table = _table(path_param(event, "table"))
    options = parse_json_param(query_params(event).get("q"), "q")
    sql, params = build_find(table, options, caller.country_filter)
    return json_response(200, pg.query(sql, params))


def get_row(event: dict) -> dict:
    caller = _reader(event)
    table = _table(path_param(event, "table"))
    rows = pg.query(*build_get(table, path_param(event, "id"), caller.country_filter))
    if not rows:
        raise HttpError(404, f"{table.label} no encontrado.")
    return json_response(200, rows[0])


# ── Escrituras sueltas ─────────────────────────────────────────────────────────────────────────

def insert_row(event: dict) -> dict:
    caller, table = _writer(event, path_param(event, "table"), "create", "insert")
    values = _body(event)
    _require_country(caller, table, values)
    return json_response(200, pg.query(*build_insert(table, values))[0])


def update_row(event: dict) -> dict:
    caller, table = _writer(event, path_param(event, "table"), "edit", "update")
    values = _body(event)
    _require_country(caller, table, values)
    rows = pg.query(*build_update(table, path_param(event, "id"), values, caller.country_filter))
    if not rows:
        raise HttpError(404, f"{table.label} no encontrado.")
    return json_response(200, rows[0])


def delete_row(event: dict) -> dict:
    caller, table = _writer(event, path_param(event, "table"), "delete", "delete")
    rows = pg.query(*build_delete(table, path_param(event, "id"), caller.country_filter))
    if not rows:
        raise HttpError(404, f"{table.label} no encontrado.")
    return empty_response(204)


# ── Transacción ────────────────────────────────────────────────────────────────────────────────

def _planned(caller: permissions.Permissions, op: object) -> tuple[str, tuple[str, list]]:
    """Valida UNA operación y devuelve su SQL. Todo se valida antes de abrir la transacción."""
    if not isinstance(op, dict) or op.get("op") not in TX_OPERATIONS:
        raise HttpError(400, 'Cada operación debe ser { op: "insert" | "update" | "delete", table, id?, values? }')
    kind = op["op"]
    table = _writable(str(op.get("table")), kind)
    caller.require(_write_module(table), TX_OPERATIONS[kind])
    values = op.get("values")
    _require_country(caller, table, values)
    if kind == "insert":
        return kind, build_insert(table, values)
    row_id = op.get("id")
    if not row_id:
        raise HttpError(400, f'La operación "{kind}" requiere "id"')
    if kind == "update":
        return kind, build_update(table, str(row_id), values, caller.country_filter)
    return kind, build_delete(table, str(row_id), caller.country_filter)


def run_transaction(event: dict) -> dict:
    caller = tarifas_perms.for_event(event)
    ops = _body(event).get("ops")
    if not isinstance(ops, list) or not ops:
        raise HttpError(400, '"ops" debe ser una lista no vacía')
    planned = [_planned(caller, op) for op in ops]

    def apply(run) -> list:
        results = []
        for kind, (sql, params) in planned:
            rows = run(sql, params)
            if kind != "insert" and not rows:
                # Lanzar acá dispara el ROLLBACK: o se aplica todo o nada.
                raise HttpError(404, "Una de las filas de la transacción no existe: no se guardó nada.")
            results.append(rows[0] if kind != "delete" else None)
        return results

    # Las operaciones ya están planificadas (solo SQL), así que repetir ante deadlock es seguro.
    results = pg.run_in_transaction(apply, retries=TX_RETRIES)
    return json_response(200, results)


# El orden importa para el servidor local (serve.py busca la primera ruta que
# calza): `/tx` va antes que `/{table}`. API Gateway prioriza la ruta literal.
ROUTES = {
    "POST /api/tarifas/tx": run_transaction,
    "GET /api/tarifas/{table}": list_rows,
    "GET /api/tarifas/{table}/{id}": get_row,
    "POST /api/tarifas/{table}": insert_row,
    "PATCH /api/tarifas/{table}/{id}": update_row,
    "DELETE /api/tarifas/{table}/{id}": delete_row,
}

handler = tms_handler(ROUTES)
