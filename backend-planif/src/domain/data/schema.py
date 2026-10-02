"""Lista blanca de columnas reales por tabla (dominio puro, runner inyectado).

Todo nombre de tabla/columna que llega del cliente se valida contra este cache
antes de interpolarse en SQL: ningún texto crudo del cliente entra a la query.
Portado de `origin/main:backend/data/src/schema.py`, pero SIN importar pg: el
cache se puebla inyectando un runner (`load_columns`/`ensure_columns`) que el
adaptador provee (`pg.query`). Se carga una vez por contenedor (cold start).
"""

from __future__ import annotations

from typing import Callable

from domain.data.relations import is_known_table
from lib.tms_common.errors import HttpError

# El adaptador ejecuta esta consulta y pasa las filas a `load_columns`.
COLUMNS_SQL = """
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position
"""

Runner = Callable[[str], list[dict]]

_columns: dict[str, set[str]] | None = None


def load_columns(run: Runner) -> dict[str, set[str]]:
    """Puebla el cache desde information_schema usando el runner inyectado."""
    global _columns
    columns: dict[str, set[str]] = {}
    for row in run(COLUMNS_SQL):
        columns.setdefault(row["table_name"], set()).add(row["column_name"])
    _columns = columns
    return columns


def ensure_columns(run: Runner) -> dict[str, set[str]]:
    """Carga el cache si aún no está (cold start); idempotente en warm start."""
    if _columns is None:
        return load_columns(run)
    return _columns


def assert_table(table: str) -> str:
    if not is_known_table(table):
        raise HttpError(400, f'Tabla desconocida: "{table}"')
    return table


def table_columns(table: str) -> set[str]:
    if _columns is None:
        # El caso de uso debe llamar `ensure_columns(pg.query)` antes de validar.
        raise HttpError(500, "El cache de columnas no está inicializado.")
    assert_table(table)
    if table not in _columns:
        raise HttpError(400, f'Tabla desconocida: "{table}"')
    return _columns[table]


def assert_column(table: str, column: str) -> str:
    if column not in table_columns(table):
        raise HttpError(400, f'Columna desconocida "{column}" en "{table}"')
    return column


def quote(identifier: str) -> str:
    """Comillas dobles de identificador. Solo sobre valores ya validados."""
    return '"' + str(identifier).replace('"', '""') + '"'
