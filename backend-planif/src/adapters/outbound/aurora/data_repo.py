"""Adaptador Aurora del port DataRepo: ejecución genérica + carga del schema.

Puebla el cache de columnas del dominio (`schema.ensure_columns`) con el runner
real (`pg.query`) y ejecuta las queries que arman los builders.
"""

from __future__ import annotations

from domain.data import schema
from lib.tms_common import pg


class AuroraDataRepo:
    """Implementa `ports.DataRepo`."""

    def ensure_schema(self) -> None:
        schema.ensure_columns(pg.query)

    def run(self, sql: str, params: list) -> list[dict]:
        return pg.query(sql, params)
