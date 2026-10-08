"""Lista blanca del tarifador: tablas, columnas y tipos.

NO se escribe a mano: se lee de `schema_manifest.json`, que se genera desde el
registro de esquema del frontend (`src/lib/tarifas/data/schema.ts`) con
`npm run tarifas:manifest`. Es la misma fuente que genera el DDL, así que el
backend no puede aceptar una tabla o columna que el ORM no declara.

Todo identificador que llega del cliente se valida acá antes de tocar el SQL.
"""

import json
from dataclasses import dataclass
from pathlib import Path

from tms_common.errors import HttpError

MANIFEST_PATH = Path(__file__).resolve().parent / "schema_manifest.json"

# Cast de Postgres por tipo de columna del registro: los parámetros viajan con
# tipo explícito (pg8000 manda los str sin tipo y un uuid o un jsonb no se
# infieren solos en todos los contextos).
SQL_CASTS = {
    "text": "text",
    "int": "integer",
    "numeric": "numeric",
    "boolean": "boolean",
    "jsonb": "jsonb",
    "timestamptz": "timestamptz",
    "uuid": "uuid",
}


@dataclass(frozen=True)
class Table:
    name: str
    entity: str
    label: str
    read_only: bool
    append_only: bool
    primary_key: str
    id_prefix: str
    columns: dict  # nombre -> {"type": ..., "nullable": ...}

    def column_type(self, column: str) -> str:
        if column not in self.columns:
            raise HttpError(400, f'Columna desconocida "{column}" en "{self.name}"')
        return self.columns[column]["type"]

    def cast(self, column: str) -> str:
        return SQL_CASTS[self.column_type(column)]

    @property
    def has_country(self) -> bool:
        return "country_id" in self.columns

    @property
    def country_nullable(self) -> bool:
        return bool(self.columns.get("country_id", {}).get("nullable"))


_tables: dict[str, Table] | None = None


def load_manifest(path: Path = MANIFEST_PATH) -> dict[str, Table]:
    global _tables
    raw = json.loads(path.read_text(encoding="utf-8"))
    _tables = {
        name: Table(
            name=name,
            entity=spec["entity"],
            label=spec["label"],
            read_only=bool(spec["readOnly"]),
            append_only=bool(spec["appendOnly"]),
            primary_key=spec["primaryKey"],
            id_prefix=spec["idPrefix"],
            columns=spec["columns"],
        )
        for name, spec in raw["tables"].items()
    }
    return _tables


def tables() -> dict[str, Table]:
    return _tables if _tables is not None else load_manifest()


def table(name: str) -> Table:
    found = tables().get(name)
    if found is None:
        raise HttpError(404, f'Tabla desconocida para el tarifador: "{name}"')
    return found


def quote(identifier: str) -> str:
    """Comillas dobles de identificador. Solo sobre valores ya validados."""
    return '"' + str(identifier).replace('"', '""') + '"'
