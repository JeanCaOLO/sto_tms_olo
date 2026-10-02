"""SELECT/COUNT parametrizados (placeholders %s). Portado de server/tms-select.mjs."""

from itertools import count
from typing import Any, Iterator

from tms_common.errors import HttpError

from relations import find_foreign_key
from schema import assert_column, quote, table_columns
from select_parser import STAR, SelectNode, parse_select

FILTER_OPS = {"eq": "=", "neq": "<>", "gt": ">", "gte": ">=", "lt": "<", "lte": "<="}
ROOT_ALIAS = "t"


def _embed(table: str, node: SelectNode, alias: str, aliases: Iterator[int]) -> str:
    # node.name es la tabla "padre"; `table` (hija) tiene la FK.
    fk_column = find_foreign_key(table, node.name)
    table_columns(node.name)
    sub = f"e{next(aliases)}"
    inner = build_field_list(node.name, node.children or [STAR], sub, aliases)
    return (
        f"(SELECT to_jsonb({sub}) FROM (SELECT {', '.join(inner)} "
        f"FROM {quote(node.name)} {sub} WHERE {sub}.{quote('id')} = {alias}.{quote(fk_column)}) {sub}) "
        f"AS {quote(node.alias)}"
    )


def build_field_list(table: str, nodes: list[SelectNode], alias: str, aliases: Iterator[int]) -> list[str]:
    parts = []
    for node in nodes:
        if node.is_star:
            parts.append(f"{alias}.*")
        elif node.children is None:
            assert_column(table, node.name)
            parts.append(f"{alias}.{quote(node.name)} AS {quote(node.alias)}")
        else:
            parts.append(_embed(table, node, alias, aliases))
    return parts


def _filter_clause(prefix: str, column: str, op: str, value: Any, params: list) -> str:
    if op == "is":
        if value is not None:
            raise HttpError(400, 'operador "is" sólo soporta null')
        return f"{prefix}{quote(column)} IS NULL"
    if op == "in":
        if not isinstance(value, list) or not value:
            return "FALSE"  # .in([]) no matchea nada, como en PostgREST
        params.extend(value)
        return f"{prefix}{quote(column)} IN ({','.join(['%s'] * len(value))})"
    if op in FILTER_OPS:
        params.append(value)
        return f"{prefix}{quote(column)} {FILTER_OPS[op]} %s"
    raise HttpError(400, f'operador no soportado: "{op}"')


def build_where(table: str, alias: str | None, filters: list | None) -> tuple[str, list]:
    """filters: lista de [columna, operador, valor]."""
    prefix = f"{alias}." if alias else ""
    params: list = []
    clauses = []
    for item in filters or []:
        if not isinstance(item, list) or len(item) != 3:
            raise HttpError(400, "Cada filtro debe ser [columna, operador, valor]")
        column, op, value = item
        assert_column(table, column)
        clauses.append(_filter_clause(prefix, column, op, value, params))
    return " AND ".join(clauses), params


def _limit_value(limit: Any) -> int:
    text = str(limit)
    if not text.isdigit():
        raise HttpError(400, "limit inválido")
    return int(text)


def _country_clause(table: str, alias: str, country_ids: tuple[str, ...] | None, params: list) -> str | None:
    """Países que ve el rol (sql/15). None = todos. Las filas sin país son compartidas y se ven."""
    if country_ids is None:
        return None
    if table == "countries":
        column, keep_null = "id", False
    elif "country_id" in table_columns(table):
        column, keep_null = "country_id", True
    else:
        return None
    ref = f"{alias}.{quote(column)}"
    null_clause = f"{ref} IS NULL" if keep_null else "FALSE"
    if not country_ids:
        return null_clause
    params.extend(country_ids)
    return f"({ref} IN ({','.join(['%s'] * len(country_ids))}) OR {null_clause})"


def _scoped_where(table: str, filters: list | None, country_ids: tuple[str, ...] | None) -> tuple[str, list]:
    clause, params = build_where(table, ROOT_ALIAS, filters)
    country = _country_clause(table, ROOT_ALIAS, country_ids, params)
    return " AND ".join(c for c in (clause, country) if c), params


def build_list_query(table: str, select: str | None, filters: list | None,
                     order: dict | None = None, limit: Any = None,
                     country_ids: tuple[str, ...] | None = None) -> tuple[str, list]:
    fields = build_field_list(table, parse_select(select), ROOT_ALIAS, count())
    clause, params = _scoped_where(table, filters, country_ids)
    sql = f"SELECT {', '.join(fields)} FROM {quote(table)} {ROOT_ALIAS}"
    if clause:
        sql += f" WHERE {clause}"
    if order and order.get("column"):
        assert_column(table, order["column"])
        direction = "DESC" if order.get("ascending") is False else "ASC"
        sql += f" ORDER BY {ROOT_ALIAS}.{quote(order['column'])} {direction}"
    if limit is not None:
        sql += f" LIMIT {_limit_value(limit)}"
    return sql, params


def build_count_query(table: str, filters: list | None,
                      country_ids: tuple[str, ...] | None = None) -> tuple[str, list]:
    clause, params = _scoped_where(table, filters, country_ids)
    sql = f"SELECT count(*)::int AS count FROM {quote(table)} {ROOT_ALIAS}"
    if clause:
        sql += f" WHERE {clause}"
    return sql, params
