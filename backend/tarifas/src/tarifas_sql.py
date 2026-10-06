"""SQL parametrizado del tarifador, a partir de la lista blanca del manifiesto.

Traduce las `FindOptions` del ORM del frontend (`src/lib/tarifas/data/datasource.ts`)
a SQL con la MISMA semántica que el driver JSON, para que un test que pasa con
JSON no se comporte distinto contra Aurora:

  - las condiciones se combinan con AND;
  - `eq` con valor null es IS NULL; `neq` es IS DISTINCT FROM (una fila con
    NULL cumple `neq`, igual que `undefined !== 'x'` en JS);
  - `in` con lista vacía no trae nada;
  - el orden pone los NULL al final.

Ningún identificador del cliente entra al SQL sin pasar por `tarifas_schema`.
"""

import json
import secrets
import time

from tms_common.errors import HttpError

from tarifas_schema import Table, quote

MAX_ROWS = 5000  # tope por consulta: protege a la Lambda de un find() sin límite
OPERATORS = {"eq", "neq", "in", "gt", "gte", "lt", "lte", "isNull", "notNull"}
COMPARISONS = {"gt": ">", "gte": ">=", "lt": "<", "lte": "<="}


def param(table: Table, column: str, value):
    """Valor tal como lo espera pg8000 para el cast de la columna."""
    if value is None:
        return None
    if table.column_type(column) == "jsonb":
        return json.dumps(value)
    return value


def placeholder(table: Table, column: str) -> str:
    return f"%s::{table.cast(column)}"


# ── WHERE ──────────────────────────────────────────────────────────────────────────────────────

def _condition(table: Table, condition: dict) -> tuple[str, list]:
    if not isinstance(condition, dict):
        raise HttpError(400, "Cada condición debe ser un objeto { column, op, value }")
    column, op = condition.get("column"), condition.get("op")
    if op not in OPERATORS:
        raise HttpError(400, f'Operador no soportado: "{op}"')
    cast = table.cast(str(column))  # valida la columna
    col = quote(column)
    value = condition.get("value")

    if op == "isNull":
        return f"{col} IS NULL", []
    if op == "notNull":
        return f"{col} IS NOT NULL", []
    if op == "in":
        if not isinstance(value, list):
            raise HttpError(400, f'"in" sobre "{column}" requiere una lista')
        if not value:
            return "FALSE", []
        return f"{col} = ANY(%s::{cast}[])", [[param(table, column, v) for v in value]]
    if op == "eq":
        if value is None:
            return f"{col} IS NULL", []
        return f"{col} = {placeholder(table, column)}", [param(table, column, value)]
    if op == "neq":
        if value is None:
            return f"{col} IS NOT NULL", []
        return f"{col} IS DISTINCT FROM {placeholder(table, column)}", [param(table, column, value)]
    return f"{col} {COMPARISONS[op]} {placeholder(table, column)}", [param(table, column, value)]


def country_clause(table: Table, countries: tuple[str, ...] | None) -> tuple[str | None, list]:
    """Filtro por los países que ve el rol (None = todos). Una fila sin país la ve cualquiera."""
    if countries is None or not table.has_country:
        return None, []
    clause = 'country_id = ANY(%s::uuid[])'
    if table.country_nullable:
        clause = f"(country_id IS NULL OR {clause})"
    return clause, [list(countries)]


def build_where(table: Table, where: list | None, countries: tuple[str, ...] | None) -> tuple[str, list]:
    if where is not None and not isinstance(where, list):
        raise HttpError(400, '"where" debe ser una lista de condiciones')
    parts, params = [], []
    for condition in where or []:
        sql, args = _condition(table, condition)
        parts.append(sql)
        params.extend(args)
    country_sql, country_args = country_clause(table, countries)
    if country_sql:
        parts.append(country_sql)
        params.extend(country_args)
    return (" AND ".join(parts) if parts else "TRUE"), params


# ── SELECT ─────────────────────────────────────────────────────────────────────────────────────

def _order(table: Table, order_by: list | None) -> str:
    if not order_by:
        return ""
    if not isinstance(order_by, list):
        raise HttpError(400, '"orderBy" debe ser una lista')
    parts = []
    for item in order_by:
        column = item.get("column") if isinstance(item, dict) else None
        table.column_type(str(column))  # valida
        direction = "DESC" if item.get("direction") == "desc" else "ASC"
        parts.append(f"{quote(column)} {direction} NULLS LAST")
    return " ORDER BY " + ", ".join(parts)


def _int(value, label: str, default: int) -> int:
    if value is None:
        return default
    if not isinstance(value, int) or isinstance(value, bool) or value < 0:
        raise HttpError(400, f'"{label}" debe ser un entero >= 0')
    return value


def build_find(table: Table, options: dict | None, countries: tuple[str, ...] | None) -> tuple[str, list]:
    options = options or {}
    if not isinstance(options, dict):
        raise HttpError(400, '"q" debe ser un objeto { where, orderBy, limit, offset }')
    where, params = build_where(table, options.get("where"), countries)
    limit = min(_int(options.get("limit"), "limit", MAX_ROWS), MAX_ROWS)
    offset = _int(options.get("offset"), "offset", 0)
    sql = f"SELECT * FROM {quote(table.name)} WHERE {where}{_order(table, options.get('orderBy'))} LIMIT {limit} OFFSET {offset}"
    return sql, params


def build_get(table: Table, row_id: str, countries: tuple[str, ...] | None) -> tuple[str, list]:
    pk = table.primary_key
    where, params = build_where(table, [{"column": pk, "op": "eq", "value": row_id}], countries)
    return f"SELECT * FROM {quote(table.name)} WHERE {where} LIMIT 1", params


# ── Escrituras ─────────────────────────────────────────────────────────────────────────────────

def new_id(prefix: str) -> str:
    """Mismo formato que `genId` del driver JSON: `<prefijo>_<ms base36>_<6 al azar>`."""
    millis = int(time.time() * 1000)
    digits = "0123456789abcdefghijklmnopqrstuvwxyz"
    base36 = ""
    while millis:
        millis, rest = divmod(millis, 36)
        base36 = digits[rest] + base36
    return f"{prefix}_{base36}_{secrets.token_hex(3)}"


def _values(table: Table, values) -> dict:
    if not isinstance(values, dict) or not values:
        raise HttpError(400, "Se esperaba un objeto con los valores de la fila")
    for column in values:
        table.column_type(str(column))  # valida
    return values


def build_insert(table: Table, values) -> tuple[str, list]:
    row = dict(_values(table, values))
    pk = table.primary_key
    if row.get(pk) in (None, ""):
        if table.column_type(pk) != "text":
            raise HttpError(400, f'"{table.name}" requiere el id')
        row[pk] = new_id(table.id_prefix)
    columns = list(row)
    column_list = ", ".join(quote(c) for c in columns)
    placeholders = ", ".join(placeholder(table, c) for c in columns)
    params = [param(table, c, row[c]) for c in columns]
    return f"INSERT INTO {quote(table.name)} ({column_list}) VALUES ({placeholders}) RETURNING *", params


def build_update(table: Table, row_id: str, values, countries: tuple[str, ...] | None) -> tuple[str, list]:
    pk = table.primary_key
    # El id nunca se reemplaza desde el payload (mismo criterio que el driver JSON).
    fields = {c: v for c, v in _values(table, values).items() if c != pk}
    if not fields:
        raise HttpError(400, "update requiere al menos un campo además del id")
    set_clause = ", ".join(f"{quote(c)} = {placeholder(table, c)}" for c in fields)
    where, where_params = build_where(table, [{"column": pk, "op": "eq", "value": row_id}], countries)
    params = [param(table, c, v) for c, v in fields.items()] + where_params
    return f"UPDATE {quote(table.name)} SET {set_clause} WHERE {where} RETURNING *", params


def build_delete(table: Table, row_id: str, countries: tuple[str, ...] | None) -> tuple[str, list]:
    pk = table.primary_key
    where, params = build_where(table, [{"column": pk, "op": "eq", "value": row_id}], countries)
    return f"DELETE FROM {quote(table.name)} WHERE {where} RETURNING {quote(pk)}", params
