"""Bitácora de auditoría (sql/16): consulta con filtros y eventos que solo ocurren
en el navegador (abrir un módulo, exportar, imprimir, descargar)."""

import json
from datetime import datetime

from tms_common import audit, pg
from tms_common import permissions as perms
from tms_common.errors import HttpError
from tms_common.event import json_body, path_param, query_params
from tms_common.responses import json_response

MODULE = "auditoria"
DEFAULT_LIMIT, MAX_LIMIT = 50, 200
CLIENT_ACTIONS = frozenset({"view", "export", "print", "download"})
MAX_METADATA_BYTES = 4096

LIST_COLUMNS = ("id, occurred_at, actor_type, app_user_id, actor_email, role_name, source, action, module_key, "
                "entity_table, entity_id, changes, request_id, ip")
EVENT_SQL = "SELECT * FROM audit.events WHERE id = %s"
MODULE_EXISTS_SQL = "SELECT 1 FROM app_modules WHERE key = %s"

# parámetro de consulta → (condición SQL, cómo se transforma el valor)
FILTERS = {
    "from": ("occurred_at >= %s", "datetime"),
    "to": ("occurred_at < %s", "datetime"),
    "actor_type": ("actor_type = %s", "text"),
    "app_user_id": ("app_user_id = %s::uuid", "text"),
    "email": ("actor_email ILIKE %s", "like"),
    "action": ("action = %s", "text"),
    "module": ("module_key = %s", "text"),
    "table": ("entity_table = %s", "text"),
    "entity_id": ("entity_id = %s", "text"),
    "before_id": ("id < %s", "int"),
}


def _ok(data: object, **extra: object) -> dict:
    return json_response(200, {"data": data, "error": None, **extra})


def _value(name: str, raw: str, kind: str) -> object:
    if kind == "datetime":
        try:
            return datetime.fromisoformat(raw.replace("Z", "+00:00"))
        except ValueError as err:
            raise HttpError(400, f'"{name}" debe ser una fecha ISO 8601') from err
    if kind == "int":
        if not raw.isdigit():
            raise HttpError(400, f'"{name}" debe ser un número')
        return int(raw)
    return f"%{raw}%" if kind == "like" else raw


def _where(params: dict) -> tuple[str, list]:
    clauses, args = [], []
    for name, (clause, kind) in FILTERS.items():
        raw = params.get(name)
        if raw not in (None, ""):
            clauses.append(clause)
            args.append(_value(name, str(raw), kind))
    return (" WHERE " + " AND ".join(clauses)) if clauses else "", args


def _limit(params: dict) -> int:
    raw = str(params.get("limit") or DEFAULT_LIMIT)
    if not raw.isdigit() or not 1 <= int(raw) <= MAX_LIMIT:
        raise HttpError(400, f'"limit" debe estar entre 1 y {MAX_LIMIT}')
    return int(raw)


def list_events(event: dict) -> dict:
    """Más reciente primero; paginación por cursor: next_cursor → ?before_id=."""
    perms.for_event(event).require(MODULE, "view")
    params = query_params(event)
    where, args = _where(params)
    limit = _limit(params)
    rows = pg.query(f"SELECT {LIST_COLUMNS} FROM audit.events{where} ORDER BY id DESC LIMIT %s", [*args, limit + 1])
    page = rows[:limit]
    next_cursor = page[-1]["id"] if len(rows) > limit else None
    return _ok(page, next_cursor=next_cursor)


def get_event(event: dict) -> dict:
    perms.for_event(event).require(MODULE, "view")
    raw = path_param(event, "id")
    rows = pg.query(EVENT_SQL, [int(raw)]) if raw.isdigit() else []
    if not rows:
        raise HttpError(404, "Evento no encontrado")
    return _ok(rows[0])


def record_client_event(event: dict) -> dict:
    body = json_body(event)
    body = body if isinstance(body, dict) else {}
    action = body.get("action")
    if action not in CLIENT_ACTIONS:
        raise HttpError(400, f'"action" debe ser una de: {", ".join(sorted(CLIENT_ACTIONS))}')
    module_key = body.get("module_key")
    if not module_key or not pg.query(MODULE_EXISTS_SQL, [module_key]):
        raise HttpError(400, f'Módulo desconocido: "{module_key}"')
    metadata = body.get("metadata")
    if metadata is not None and (not isinstance(metadata, dict) or len(json.dumps(metadata)) > MAX_METADATA_BYTES):
        raise HttpError(400, f'"metadata" debe ser un objeto de hasta {MAX_METADATA_BYTES} bytes')
    audit.record(event, action, module_key=module_key, metadata=metadata)
    return _ok({"recorded": True})
