"""API del tarifador / liquidador: el backend del ORM del frontend.

Implementa el contrato de `src/lib/tarifas/data/http-datasource.ts`:

    GET    /api/tarifas/{table}?q={json}   -> Row[]   q = { where, orderBy, limit, offset }
    GET    /api/tarifas/{table}/{id}       -> Row | 404
    POST   /api/tarifas/{table}            -> Row      body = la fila
    PATCH  /api/tarifas/{table}/{id}       -> Row      body = campos a mezclar
    DELETE /api/tarifas/{table}/{id}       -> 204
    POST   /api/tarifas/tx                 -> Row[]    body = { ops: [...] }, todo o nada
    POST   /api/tarifas/batch              -> Row[][]  body = { queries: [{ table, q }] }, varias lecturas en una llamada
    POST   /api/tarifas/{table}/find       -> Row[]    body = q (igual que GET, para consultas largas que no caben en la URL)

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

import json

from tms_common import permissions
from tms_common.errors import HttpError
from tms_common.event import json_body, parse_json_param, path_param, query_params, route_key
from tms_common.handler import tms_handler
from tms_common.responses import empty_response, json_response

import tarifas_db
import tarifas_metrics
import tarifas_perms
from tarifas_schema import Table, table as table_def
from tarifas_sql import MAX_ROWS, build_delete, build_find, build_get, build_insert, build_insert_many, build_update

MODULE = "tarifas"
CONFIG_MODULE = "tarifas.config"
# Lo único que escribe quien liquida; todo lo demás es configuración.
LIQUIDATION_TABLES = frozenset({"tarifas_settlements", "tarifas_audit_log", "tarifas_trip_order_marks"})
MAX_BATCH = 25  # lecturas por llamada de /batch: el catálogo de un cálculo usa ~11
TX_RETRIES = 2  # reintentos ante deadlock (40P01) o fallo de serialización (40001)
TX_OPERATIONS = {"insert": "create", "insert_many": "create", "update": "edit", "delete": "delete"}


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


def _require_country(caller: permissions.Permissions, table: Table, values: object, creating: bool = False) -> None:
    """No se escribe una fila de un país que el rol no ve.

    Una fila SIN país (regla global, p. ej.) la ve cualquiera: un rol acotado a ciertos países no puede
    crearla ni volver global una fila existente, porque con eso escribiría fuera de sus países."""
    allowed = caller.country_filter
    if allowed is None or not table.has_country or not isinstance(values, dict):
        return
    country = values.get("country_id")
    if country is not None and str(country) not in allowed:
        raise HttpError(403, "Tu rol no tiene acceso a ese país.")
    if table.country_nullable and (country is None and ("country_id" in values or creating)):
        raise HttpError(403, "Tu rol solo puede escribir filas de sus países, no globales.")


def _body(event: dict) -> dict:
    body = json_body(event)
    if not isinstance(body, dict):
        raise HttpError(400, "El body debe ser un objeto JSON")
    return body


# ── Lectura ────────────────────────────────────────────────────────────────────────────────────

def _reads_response(tables: list[Table], results: list[tuple[object, list]], as_list: bool = False) -> dict:
    """Respuesta de lectura; avisa cuando el tope de `MAX_ROWS` recortó el resultado.

    Una consulta sin `limit` (o con uno mayor al tope) que devuelve exactamente `MAX_ROWS` filas casi
    seguro quedó truncada, y antes nadie se enteraba: el cliente trabajaba con datos incompletos.
    Se deja una línea de log (CloudWatch) y el encabezado `X-Tarifas-Truncated`."""
    truncated = [
        t.name for t, (options, rows) in zip(tables, results)
        if len(rows) >= MAX_ROWS and not _explicit_limit(options)
    ]
    body = [rows for _, rows in results] if as_list else results[0][1]
    response = json_response(200, body)
    if truncated:
        print(json.dumps({"warning": "tarifas_find_truncated", "maxRows": MAX_ROWS, "tables": truncated}))
        response["headers"]["X-Tarifas-Truncated"] = ",".join(truncated)
    return response


def _explicit_limit(options: object) -> bool:
    limit = options.get("limit") if isinstance(options, dict) else None
    return isinstance(limit, int) and not isinstance(limit, bool) and limit < MAX_ROWS


def list_rows(event: dict) -> dict:
    caller = _reader(event)
    table = _table(path_param(event, "table"))
    options = parse_json_param(query_params(event).get("q"), "q")
    sql, params = build_find(table, options, caller.country_filter)
    return _reads_response([table], [(options, tarifas_db.query(sql, params))])


def find_rows(event: dict) -> dict:
    """Lo mismo que `list_rows`, con `q` en el cuerpo: una consulta con miles de ids no cabe en la URL."""
    caller = _reader(event)
    table = _table(path_param(event, "table"))
    options = _body(event)
    sql, params = build_find(table, options, caller.country_filter)
    return _reads_response([table], [(options, tarifas_db.query(sql, params))])


def batch_rows(event: dict) -> dict:
    """Varias lecturas en UNA llamada: el catálogo de un cálculo eran ~14 requests, una por tabla.

    Cada consulta lleva las mismas reglas que `list_rows` (lista blanca, filtro de países del rol).
    Devuelve un array de resultados en el mismo orden que `queries`. Es solo lectura."""
    caller = _reader(event)
    queries = _body(event).get("queries")
    if not isinstance(queries, list) or not queries:
        raise HttpError(400, '"queries" debe ser una lista no vacía de { table, q }')
    if len(queries) > MAX_BATCH:
        raise HttpError(400, f'"queries" admite hasta {MAX_BATCH} consultas por llamada')
    planned, tables, options = [], [], []
    for item in queries:
        if not isinstance(item, dict):
            raise HttpError(400, "Cada consulta debe ser un objeto { table, q }")
        table = _table(str(item.get("table")))
        planned.append(build_find(table, item.get("q"), caller.country_filter))
        tables.append(table)
        options.append(item.get("q"))
    results = [(opt, tarifas_db.query(sql, params)) for opt, (sql, params) in zip(options, planned)]
    return _reads_response(tables, results, as_list=True)


def get_row(event: dict) -> dict:
    caller = _reader(event)
    table = _table(path_param(event, "table"))
    rows = tarifas_db.query(*build_get(table, path_param(event, "id"), caller.country_filter))
    if not rows:
        raise HttpError(404, f"{table.label} no encontrado.")
    return json_response(200, rows[0])


# ── Escrituras sueltas ─────────────────────────────────────────────────────────────────────────

def insert_row(event: dict) -> dict:
    caller, table = _writer(event, path_param(event, "table"), "create", "insert")
    values = _body(event)
    _require_country(caller, table, values, creating=True)
    return json_response(200, tarifas_db.query(*build_insert(table, values))[0])


def update_row(event: dict) -> dict:
    caller, table = _writer(event, path_param(event, "table"), "edit", "update")
    values = _body(event)
    _require_country(caller, table, values)
    rows = tarifas_db.query(*build_update(table, path_param(event, "id"), values, caller.country_filter))
    if not rows:
        if table.name == "tarifas_settlements" and isinstance(values, dict) and "status" in values:
            # O no existe, o el estado actual no permite ese cambio (otro usuario se adelantó).
            raise HttpError(409, f"{table.label}: no existe o su estado actual no permite pasar a \"{values['status']}\".")
        raise HttpError(404, f"{table.label} no encontrado.")
    return json_response(200, rows[0])


def delete_row(event: dict) -> dict:
    caller, table = _writer(event, path_param(event, "table"), "delete", "delete")
    rows = tarifas_db.query(*build_delete(table, path_param(event, "id"), caller.country_filter))
    if not rows:
        raise HttpError(404, f"{table.label} no encontrado.")
    return empty_response(204)


# ── Transacción ────────────────────────────────────────────────────────────────────────────────

def _planned(caller: permissions.Permissions, op: object) -> list[tuple[str, tuple[str, list]]]:
    """Valida UNA operación y devuelve su SQL (una o varias sentencias). Todo se valida antes de abrir la transacción."""
    if not isinstance(op, dict) or op.get("op") not in TX_OPERATIONS:
        raise HttpError(400, 'Cada operación debe ser { op: "insert" | "insert_many" | "update" | "delete", table, id?, values?, rows? }')
    kind = op["op"]
    table = _writable(str(op.get("table")), kind)
    caller.require(_write_module(table), TX_OPERATIONS[kind])
    if kind == "insert_many":
        rows = op.get("rows")
        for row in rows if isinstance(rows, list) else []:
            _require_country(caller, table, row, creating=True)
        return [(kind, statement) for statement in build_insert_many(table, rows)]
    values = op.get("values")
    _require_country(caller, table, values, creating=(kind == "insert"))
    if kind == "insert":
        return [(kind, build_insert(table, values))]
    row_id = op.get("id")
    if not row_id:
        raise HttpError(400, f'La operación "{kind}" requiere "id"')
    if kind == "update":
        return [(kind, build_update(table, str(row_id), values, caller.country_filter))]
    return [(kind, build_delete(table, str(row_id), caller.country_filter))]


def run_transaction(event: dict) -> dict:
    caller = tarifas_perms.for_event(event)
    ops = _body(event).get("ops")
    if not isinstance(ops, list) or not ops:
        raise HttpError(400, '"ops" debe ser una lista no vacía')
    planned = [statement for op in ops for statement in _planned(caller, op)]

    def apply(run) -> list:
        results: list = []
        for kind, (sql, params) in planned:
            rows = run(sql, params)
            if kind not in ("insert", "insert_many") and not rows:
                # Lanzar acá dispara el ROLLBACK: o se aplica todo o nada.
                raise HttpError(404, "Una de las filas de la transacción no existe: no se guardó nada.")
            if kind == "insert_many":
                results.extend(rows)
            else:
                results.append(rows[0] if kind != "delete" else None)
        return results

    # Las operaciones ya están planificadas (solo SQL), así que repetir ante deadlock es seguro.
    results = tarifas_db.run_in_transaction(apply, retries=TX_RETRIES)
    return json_response(200, results)


# El orden importa para el servidor local (serve.py busca la primera ruta que
# calza): `/tx` va antes que `/{table}`. API Gateway prioriza la ruta literal.
# Lecturas que viajan por POST (cuerpo grande): no son escrituras, así que no pasan por la
# auditoría de actor de `tms_handler` (2 sentencias extra por request).
READ_POSTS = {
    "POST /api/tarifas/batch": batch_rows,
    "POST /api/tarifas/{table}/find": find_rows,
}

ROUTES = {
    "POST /api/tarifas/tx": run_transaction,
    **READ_POSTS,
    "GET /api/tarifas/{table}": list_rows,
    "GET /api/tarifas/{table}/{id}": get_row,
    "POST /api/tarifas/{table}": insert_row,
    "PATCH /api/tarifas/{table}/{id}": update_row,
    "DELETE /api/tarifas/{table}/{id}": delete_row,
}

def _as_get(key: str) -> str:
    return "GET " + key.split(" ", 1)[1]


_writes = tms_handler({key: fn for key, fn in ROUTES.items() if key not in READ_POSTS})
_reads = tms_handler({_as_get(key): fn for key, fn in READ_POSTS.items()})


def handler(event: dict, context: object) -> dict:
    """Despacha la request y deja una línea de métricas (ver `tarifas_metrics`)."""
    key = route_key(event)
    tarifas_metrics.start()
    status = 500
    try:
        if key in READ_POSTS:
            response = _reads({**event, "routeKey": _as_get(key)}, context)
        else:
            response = _writes(event, context)
        status = response.get("statusCode", 200)
        return response
    finally:
        table = (event.get("pathParameters") or {}).get("table")
        tarifas_metrics.finish(key, table, status)
