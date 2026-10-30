"""Bitácora de auditoría de la BD compartida (tabla audit.events del TMS).

Los cambios de filas los captura un trigger de la BD; aquí solo se le dice QUIÉN hace el request
(`bind`: `tms.audit_actor` LOCAL a cada transacción de escritura) y se olvida al terminar (`clear`). Los eventos que no son filas
(login, login fallido) se insertan directo con `record`.
"""

import json
import os

from . import db

INSERT_EVENT_SQL = """
INSERT INTO audit.events (actor_type, auth_user_id, app_user_id, actor_email, role_name, source, action,
                          module_key, entity_table, entity_id, request_id, ip, user_agent, metadata)
SELECT %s, au.auth_user_id, au.id, %s, r.name, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb
FROM (SELECT %s::uuid AS auth_user_id) caller
LEFT JOIN app_users au ON au.auth_user_id = caller.auth_user_id
LEFT JOIN roles r ON r.id = au.role_id
"""


def source(route: str) -> str:
    return f'{os.environ.get("AWS_LAMBDA_FUNCTION_NAME") or "mobile-api-local"} {route}'.strip()


def request_info(event: dict) -> tuple[str | None, str | None, str | None]:
    context = event.get("requestContext") or {}
    http = context.get("http") or {}
    headers = {str(k).lower(): v for k, v in (event.get("headers") or {}).items()}
    return context.get("requestId"), http.get("sourceIp"), http.get("userAgent") or headers.get("user-agent")


def actor(event: dict, route: str, auth_user_id: str | None, email: str | None) -> dict:
    request_id, ip, user_agent = request_info(event)
    return {"type": "user" if auth_user_id else "anonymous", "auth_user_id": auth_user_id, "email": email,
            "source": source(route), "request_id": request_id, "ip": ip, "user_agent": user_agent}


def bind(who: dict) -> None:
    """Las escrituras de esta request (todas van por `db.run_in_transaction`) llevarán este actor."""
    db.bind_actor(json.dumps(who))


def clear() -> None:
    db.bind_actor(None)


def record(event: dict, route: str, action: str, *, email: str | None = None, auth_user_id: str | None = None,
           metadata: dict | None = None) -> None:
    """Evento de acceso (login, login_failed, refresh...). Un fallo de bitácora nunca tumba la request."""
    who = actor(event, route, auth_user_id, email)
    try:
        db.query(INSERT_EVENT_SQL, [
            who["type"], email, who["source"], action, "mobile", None, None,
            who["request_id"], who["ip"], who["user_agent"], json.dumps(metadata) if metadata else None,
            auth_user_id])
    except Exception:  # noqa: BLE001 - la auditoría de accesos no debe impedir el acceso
        pass
