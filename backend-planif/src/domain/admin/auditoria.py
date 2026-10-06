"""Reglas puras de la bitácora de auditoría: construcción de filtros de consulta,
límites y validación de eventos de cliente.

Portado de la parte NO-SQL de `origin/main:backend/admin/src/admin_audit.py`
(`_value`, `_where`, `_limit`, catálogo de acciones de cliente). No ejecuta SQL:
arma cláusulas parametrizadas (texto fijo + args) que el adaptador outbound
corre. Lanza `DatosInvalidos`; el adaptador inbound lo mapea a 400.
"""

from __future__ import annotations

import json
from datetime import datetime

from domain.admin.payload import DatosInvalidos

MODULE = "auditoria"
DEFAULT_LIMIT, MAX_LIMIT = 50, 200
CLIENT_ACTIONS = frozenset({"view", "export", "print", "download"})
MAX_METADATA_BYTES = 4096
# Sin "from": últimos 3 meses (solo se leen esas particiones, sql/17).
DEFAULT_WINDOW = "occurred_at >= now() - interval '3 months'"

LIST_COLUMNS = ("id, occurred_at, actor_type, app_user_id, actor_email, role_name, source, action, module_key, "
                "entity_table, entity_id, changes, request_id, ip")

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


def _value(name: str, raw: str, kind: str) -> object:
    if kind == "datetime":
        try:
            return datetime.fromisoformat(raw.replace("Z", "+00:00"))
        except ValueError as err:
            raise DatosInvalidos(f'"{name}" debe ser una fecha ISO 8601') from err
    if kind == "int":
        if not raw.isdigit():
            raise DatosInvalidos(f'"{name}" debe ser un número')
        return int(raw)
    return f"%{raw}%" if kind == "like" else raw


def build_where(params: dict) -> tuple[str, list]:
    """Cláusula WHERE parametrizada a partir de los query params permitidos."""
    clauses, args = [], []
    for name, (clause, kind) in FILTERS.items():
        raw = params.get(name)
        if raw not in (None, ""):
            clauses.append(clause)
            args.append(_value(name, str(raw), kind))
    if params.get("from") in (None, ""):
        clauses.insert(0, DEFAULT_WINDOW)
    return (" WHERE " + " AND ".join(clauses)) if clauses else "", args


def limit(params: dict) -> int:
    raw = str(params.get("limit") or DEFAULT_LIMIT)
    if not raw.isdigit() or not 1 <= int(raw) <= MAX_LIMIT:
        raise DatosInvalidos(f'"limit" debe estar entre 1 y {MAX_LIMIT}')
    return int(raw)


def valid_client_action(action: object) -> str:
    if action not in CLIENT_ACTIONS:
        raise DatosInvalidos(f'"action" debe ser una de: {", ".join(sorted(CLIENT_ACTIONS))}')
    return action  # type: ignore[return-value]


def valid_metadata(metadata: object) -> None:
    if metadata is not None and (not isinstance(metadata, dict) or len(json.dumps(metadata)) > MAX_METADATA_BYTES):
        raise DatosInvalidos(f'"metadata" debe ser un objeto de hasta {MAX_METADATA_BYTES} bytes')
