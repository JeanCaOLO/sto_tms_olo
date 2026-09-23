"""Lista blanca de columnas reales por tabla.

Todo nombre de tabla/columna que llega del cliente se valida contra este cache
antes de interpolarse en SQL: ningún texto crudo del cliente entra a la query.
Se carga una vez por contenedor (cold start) desde information_schema.
"""

from typing import Callable

from tms_common import pg
from tms_common.errors import HttpError

from relations import is_known_table

COLUMNS_SQL = """
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position
"""

_columns: dict[str, set[str]] | None = None


def load_columns(run: Callable[[str], list[dict]] = pg.query) -> dict[str, set[str]]:
    global _columns
    columns: dict[str, set[str]] = {}
    for row in run(COLUMNS_SQL):
        columns.setdefault(row["table_name"], set()).add(row["column_name"])
    _columns = columns
    return columns


def assert_table(table: str) -> str:
    if not is_known_table(table):
        raise HttpError(400, f'Tabla desconocida: "{table}"')
    return table


def table_columns(table: str) -> set[str]:
    columns = _columns if _columns is not None else load_columns()
    assert_table(table)
    if table not in columns:
        raise HttpError(400, f'Tabla desconocida: "{table}"')
    return columns[table]


def assert_column(table: str, column: str) -> str:
    if column not in table_columns(table):
        raise HttpError(400, f'Columna desconocida "{column}" en "{table}"')
    return column


def quote(identifier: str) -> str:
    """Comillas dobles de identificador. Solo sobre valores ya validados."""
    return '"' + str(identifier).replace('"', '""') + '"'
