"""Bitácora de auditoría (sql/16, tabla audit.events).

Dos caminos, uno por tipo de acción:
- Cambios de filas: los captura el trigger de BD. Aquí solo se le dice QUIÉN
  hace el request (`bind`), fijando `tms.audit_actor` en la conexión antes de
  una ruta que escribe, y se limpia al terminar (`clear`). Sin actor, el
  trigger los registra como `system`.
- Eventos que no son filas (login, logout, exportar, abrir un módulo):
  `record` los inserta directo.
"""

import json
import os

from . import pg
from .event import route_key

WRITE_METHODS = frozenset({"POST", "PATCH", "PUT", "DELETE"})
SET_ACTOR_SQL = "SELECT set_config('tms.audit_actor', %s, false)"
INSERT_EVENT_SQL = """
INSERT INTO audit.events (actor_type, auth_user_id, app_user_id, actor_email, role_name, source, action,
                          module_key, entity_table, entity_id, request_id, ip, user_agent, metadata)
SELECT %s, au.auth_user_id, au.id, %s, r.name, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb
FROM (SELECT %s::uuid AS auth_user_id) caller
LEFT JOIN app_users au ON au.auth_user_id = caller.auth_user_id
LEFT JOIN roles r ON r.id = au.role_id
"""


def source(event: dict) -> str:
    return f'{os.environ.get("AWS_LAMBDA_FUNCTION_NAME") or "api-local"} {route_key(event)}'.strip()


def _claims(event: dict) -> dict:
    authorizer = (event.get("requestContext") or {}).get("authorizer") or {}
    return authorizer.get("lambda") or {}


def _request(event: dict) -> tuple[str | None, str | None, str | None]:
    context = event.get("requestContext") or {}
    http = context.get("http") or {}
    headers = {str(k).lower(): v for k, v in (event.get("headers") or {}).items()}
    return context.get("requestId"), http.get("sourceIp"), http.get("userAgent") or headers.get("user-agent")


def actor(event: dict) -> dict:
    claims = _claims(event)
    request_id, ip, user_agent = _request(event)
    return {"type": "user" if claims.get("sub") else "anonymous", "auth_user_id": claims.get("sub"),
            "email": claims.get("email"), "source": source(event), "request_id": request_id,
            "ip": ip, "user_agent": user_agent}


def is_write(event: dict) -> bool:
    return route_key(event).split(" ", 1)[0] in WRITE_METHODS


def bind(event: dict) -> None:
    pg.query(SET_ACTOR_SQL, [json.dumps(actor(event))])


def clear() -> None:
    pg.query(SET_ACTOR_SQL, [""])


def record(event: dict, action: str, *, module_key: str | None = None, entity_table: str | None = None,
           entity_id: str | None = None, metadata: dict | None = None, email: str | None = None,
           auth_user_id: str | None = None, actor_type: str | None = None) -> None:
    who = actor(event)
    user_id = auth_user_id or who["auth_user_id"]
    kind = actor_type or ("user" if user_id else "anonymous")
    pg.query(INSERT_EVENT_SQL, [
        kind, email or who["email"], who["source"], action, module_key, entity_table, entity_id,
        who["request_id"], who["ip"], who["user_agent"], json.dumps(metadata) if metadata else None, user_id,
    ])
