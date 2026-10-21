"""SQL parametrizado del tarifador, a partir de la lista blanca del manifiesto.

Traduce las `FindOptions` del ORM del frontend (`src/lib/tarifas/data/datasource.ts`)
a SQL con la MISMA semántica que el driver JSON, para que un test que pasa con
JSON no se comporte distinto contra Aurora:

  - las condiciones se combinan con AND;
  - `eq` con valor null es IS NULL; `neq` es IS DISTINCT FROM (una fila con
    NULL cumple `neq`, igual que `undefined !== 'x'` en JS);
  - `in` con lista vacía no trae nada;
  - el orden pone los NULL al final;
  - `after` (paginación por cursor): trae las filas que vienen DESPUÉS de la última de la página
    anterior, comparando la tupla de las columnas del orden. Exige `orderBy` con la misma dirección en
    todas las columnas y columnas sin NULL; es lo que mantiene barato el "página siguiente" aunque el
    historial crezca (un OFFSET grande lee y descarta todo lo anterior).

Ningún identificador del cliente entra al SQL sin pasar por `tarifas_schema`.
"""

import json
import secrets
import time

from tms_common.errors import HttpError

from tarifas_schema import Table, quote

MAX_ROWS = 5000  # tope por consulta: protege a la Lambda de un find() sin límite
MAX_INSERT_ROWS = 5000  # filas de una operación `insert_many`
MAX_PARAMS = 30000  # parámetros por sentencia (el protocolo de Postgres admite 65535)
OPERATORS = {"eq", "neq", "in", "gt", "gte", "lt", "lte", "isNull", "notNull", "ilike"}
COMPARISONS = {"gt": ">", "gte": ">=", "lt": "<", "lte": "<="}
MAX_ILIKE_COLUMNS = 8  # columnas de una búsqueda `a|b|c`


def _ilike(table: Table, column: str, value) -> tuple[str, list]:
    """Contiene el texto (sin distinguir mayúsculas). `column` puede ser `a|b|c`: basta que una coincida.

    Los comodines del cliente (`%`, `_`, `\\`) se escapan: se busca el texto tal cual.
    """
    if not isinstance(value, str) or not value.strip():
        raise HttpError(400, f'"ilike" sobre "{column}" requiere un texto no vacío')
    names = column.split("|")
    if len(names) > MAX_ILIKE_COLUMNS:
        raise HttpError(400, f'"ilike" admite hasta {MAX_ILIKE_COLUMNS} columnas')
    for name in names:
        table.cast(name)  # valida la columna
    escaped = value.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    clauses = [f"{quote(name)}::text ILIKE %s" for name in names]
    return "(" + " OR ".join(clauses) + ")", [f"%{escaped}%"] * len(names)


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
    value = condition.get("value")
    if op == "ilike":
        return _ilike(table, str(column), value)
    cast = table.cast(str(column))  # valida la columna
    col = quote(column)

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


def _after(table: Table, after, order_by) -> tuple[str, list]:
    """Condición de cursor: `(a, b) < (%s, %s)` si el orden es descendente, `>` si es ascendente."""
    if not isinstance(after, dict) or not after:
        raise HttpError(400, '"after" debe ser un objeto { columna: valor } con las columnas del orden')
    if not isinstance(order_by, list) or not order_by:
        raise HttpError(400, '"after" requiere "orderBy"')
    columns = [str(item.get("column")) if isinstance(item, dict) else "" for item in order_by]
    directions = {"desc" if isinstance(item, dict) and item.get("direction") == "desc" else "asc" for item in order_by}
    if len(directions) != 1:
        raise HttpError(400, '"after" exige la misma dirección en todas las columnas de "orderBy"')
    if list(after) != columns:
        raise HttpError(400, '"after" debe tener exactamente las columnas de "orderBy", en el mismo orden')
    for column in columns:
        table.column_type(column)  # valida
        if after[column] is None:
            raise HttpError(400, f'"after" no admite NULL (columna "{column}")')
    operator = "<" if directions == {"desc"} else ">"
    names = ", ".join(quote(c) for c in columns)
    holders = ", ".join(placeholder(table, c) for c in columns)
    return f"({names}) {operator} ({holders})", [param(table, c, after[c]) for c in columns]


def build_where(table: Table, where: list | None, countries: tuple[str, ...] | None,
                after=None, order_by=None) -> tuple[str, list]:
    if where is not None and not isinstance(where, list):
        raise HttpError(400, '"where" debe ser una lista de condiciones')
    parts, params = [], []
    for condition in where or []:
        sql, args = _condition(table, condition)
        parts.append(sql)
        params.extend(args)
    if after is not None:
        sql, args = _after(table, after, order_by)
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


def _select_list(table: Table, columns) -> str:
    """`*` sin proyección; con `columns`, solo esas (validadas contra el manifiesto)."""
    if columns is None:
        return "*"
    if not isinstance(columns, list) or not columns or not all(isinstance(c, str) for c in columns):
        raise HttpError(400, '"columns" debe ser una lista no vacía de nombres de columna')
    for column in columns:
        table.column_type(column)  # valida
    return ", ".join(quote(column) for column in dict.fromkeys(columns))


def build_find(table: Table, options: dict | None, countries: tuple[str, ...] | None) -> tuple[str, list]:
    options = options or {}
    if not isinstance(options, dict):
        raise HttpError(400, '"q" debe ser un objeto { where, orderBy, limit, offset }')
    where, params = build_where(table, options.get("where"), countries, options.get("after"), options.get("orderBy"))
    limit = min(_int(options.get("limit"), "limit", MAX_ROWS), MAX_ROWS)
    offset = _int(options.get("offset"), "offset", 0)
    sql = f"SELECT {_select_list(table, options.get('columns'))} FROM {quote(table.name)} WHERE {where}{_order(table, options.get('orderBy'))} LIMIT {limit} OFFSET {offset}"
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


def build_insert_many(table: Table, rows) -> list[tuple[str, list]]:
    """Inserta muchas filas con pocas sentencias: un `INSERT ... VALUES (...), (...)` por tanda.

    Cada fila pasa por las mismas validaciones y el mismo id que `build_insert`. Las filas con las mismas
    columnas, seguidas, comparten sentencia (el importador de tarifarios manda cientos iguales); se
    corta además para no pasar de `MAX_PARAMS` parámetros. El orden de las filas se conserva."""
    if not isinstance(rows, list) or not rows:
        raise HttpError(400, '"rows" debe ser una lista no vacía de filas')
    if len(rows) > MAX_INSERT_ROWS:
        raise HttpError(400, f'"insert_many" admite hasta {MAX_INSERT_ROWS} filas por operación')
    pk = table.primary_key
    prepared = []
    for values in rows:
        row = dict(_values(table, values))
        if row.get(pk) in (None, ""):
            if table.column_type(pk) != "text":
                raise HttpError(400, f'"{table.name}" requiere el id')
            row[pk] = new_id(table.id_prefix)
        prepared.append(row)

    statements: list[tuple[str, list]] = []
    start = 0
    while start < len(prepared):
        columns = list(prepared[start])
        per_chunk = max(1, MAX_PARAMS // len(columns))
        end = start
        while end < len(prepared) and end - start < per_chunk and list(prepared[end]) == columns:
            end += 1
        chunk = prepared[start:end]
        column_list = ", ".join(quote(c) for c in columns)
        one = "(" + ", ".join(placeholder(table, c) for c in columns) + ")"
        params = [param(table, c, row[c]) for row in chunk for c in columns]
        statements.append((
            f"INSERT INTO {quote(table.name)} ({column_list}) VALUES {', '.join([one] * len(chunk))} RETURNING *",
            params,
        ))
        start = end
    return statements


# ── Liquidaciones emitidas: inmutables salvo su ciclo de vida ──────────────────────────────────
# El total, el desglose, el número y el viaje de una liquidación no se editan nunca: lo único que
# cambia después de emitirla es su estado (y el motivo de margen / la marca de reemplazo que lo
# acompañan). Antes el servidor aceptaba cualquier columna de cualquier PATCH y confiaba en que el
# cliente respetara `statusTransitions.ts`; ahora lo hace cumplir, y la transición se valida en el
# propio UPDATE (WHERE status = ANY(origenes)), de modo que dos usuarios a la vez no pisan la regla.
SETTLEMENTS_TABLE = "tarifas_settlements"
SETTLEMENT_MUTABLE_COLUMNS = frozenset({"status", "margin_reason", "superseded_by", "updated_at"})
# Espejo de ALLOWED_TRANSITIONS en src/lib/tarifas/settlements/statusTransitions.ts.
SETTLEMENT_TRANSITIONS = {
    "Borrador": ("En Revisión", "Aprobado", "Pagado", "Anulado"),
    "En Revisión": ("Borrador", "Aprobado", "Pagado", "Anulado"),
    "Aprobado": ("Pagado", "Anulado", "En Revisión"),
    "Pagado": ("Anulado",),
    "Anulado": (),
}


def _settlement_guard(fields: dict) -> tuple[str, list] | None:
    """Cláusula extra del UPDATE de una liquidación (o None si el cambio no toca el estado)."""
    frozen = sorted(set(fields) - SETTLEMENT_MUTABLE_COLUMNS)
    if frozen:
        raise HttpError(403, f"Una liquidación emitida es inmutable: no se puede modificar {', '.join(frozen)}.")
    if "status" not in fields:
        return None
    target = fields["status"]
    if target not in SETTLEMENT_TRANSITIONS:
        raise HttpError(400, f'Estado de liquidación desconocido: "{target}".')
    origins = [origin for origin, allowed in SETTLEMENT_TRANSITIONS.items() if target in allowed]
    clause = f"{quote('status')} = ANY(%s::text[])"
    if target != "Anulado":
        # Una liquidación reemplazada al re-liquidar solo puede quedar anulada, nunca reactivarse.
        clause += f" AND {quote('superseded_by')} IS NULL"
    return clause, [origins]


def build_update(table: Table, row_id: str, values, countries: tuple[str, ...] | None) -> tuple[str, list]:
    pk = table.primary_key
    # El id nunca se reemplaza desde el payload (mismo criterio que el driver JSON).
    fields = {c: v for c, v in _values(table, values).items() if c != pk}
    if not fields:
        raise HttpError(400, "update requiere al menos un campo además del id")
    set_clause = ", ".join(f"{quote(c)} = {placeholder(table, c)}" for c in fields)
    where, where_params = build_where(table, [{"column": pk, "op": "eq", "value": row_id}], countries)
    extra = _settlement_guard(fields) if table.name == SETTLEMENTS_TABLE else None
    if extra:
        where = f"{where} AND {extra[0]}"
        where_params = where_params + extra[1]
    params = [param(table, c, v) for c, v in fields.items()] + where_params
    return f"UPDATE {quote(table.name)} SET {set_clause} WHERE {where} RETURNING *", params


def build_delete(table: Table, row_id: str, countries: tuple[str, ...] | None) -> tuple[str, list]:
    pk = table.primary_key
    where, params = build_where(table, [{"column": pk, "op": "eq", "value": row_id}], countries)
    return f"DELETE FROM {quote(table.name)} WHERE {where} RETURNING {quote(pk)}", params
