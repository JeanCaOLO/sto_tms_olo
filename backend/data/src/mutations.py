"""INSERT/UPDATE/DELETE parametrizados. Portado de server/tms-mutations.mjs."""

from tms_common.errors import HttpError

from schema import assert_column, quote
from select_query import build_where


def build_insert_query(table: str, rows: dict | list | None) -> tuple[str, list]:
    """Mismo shape que `.insert(obj | obj[])` de supabase-js: columnas = unión
    de llaves de todas las filas; una fila sin cierta columna inserta NULL."""
    items = rows if isinstance(rows, list) else [rows]
    if not items or not all(isinstance(row, dict) and row for row in items):
        raise HttpError(400, "insert requiere al menos una fila con valores")
    columns = list(dict.fromkeys(key for row in items for key in row))
    for column in columns:
        assert_column(table, column)
    params = [row.get(column) for row in items for column in columns]
    placeholders = "(" + ",".join(["%s"] * len(columns)) + ")"
    values = ", ".join([placeholders] * len(items))
    column_list = ", ".join(quote(column) for column in columns)
    return f"INSERT INTO {quote(table)} ({column_list}) VALUES {values} RETURNING *", params


def _require_filters(filters: list | None, operation: str) -> None:
    # El Express permitía UPDATE/DELETE sin filtros (afectaba la tabla
    # entera). Se bloquea: ningún call-site del frontend lo necesita.
    if not filters:
        raise HttpError(400, f"{operation} requiere al menos un filtro")


def build_update_query(table: str, values: dict | None, filters: list | None) -> tuple[str, list]:
    if not isinstance(values, dict) or not values:
        raise HttpError(400, "update requiere al menos un campo")
    _require_filters(filters, "update")
    for column in values:
        assert_column(table, column)
    set_clause = ", ".join(f"{quote(column)} = %s" for column in values)
    where, where_params = build_where(table, None, filters)
    sql = f"UPDATE {quote(table)} SET {set_clause} WHERE {where} RETURNING *"
    return sql, [*values.values(), *where_params]


def build_delete_query(table: str, filters: list | None) -> tuple[str, list]:
    _require_filters(filters, "delete")
    where, params = build_where(table, None, filters)
    return f"DELETE FROM {quote(table)} WHERE {where} RETURNING *", params
