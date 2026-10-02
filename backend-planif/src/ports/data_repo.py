"""Port: ejecución genérica de queries de la API de datos y carga del schema.

El servicio de datos arma el SQL con los builders (que solo usan la lista blanca
del dominio) y lo ejecuta a través de este port. Así los casos de uso no
importan pg directamente; el adaptador Aurora concreto lo implementa.
"""

from __future__ import annotations

from typing import Protocol


class DataRepo(Protocol):
    def ensure_schema(self) -> None:
        """Asegura el cache de columnas (cold start) usando el runner real."""
        ...

    def run(self, sql: str, params: list) -> list[dict]:
        """Ejecuta una query ya parametrizada y devuelve filas."""
        ...
