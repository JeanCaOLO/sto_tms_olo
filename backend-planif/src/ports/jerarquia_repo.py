"""Port: lectura de la jerarquía operativa y CRUD de puntos de entrega (Aurora).

País → almacén → cliente → cliente final → punto de entrega. Las lecturas
devuelven filas (dicts) listas para serializar; la autorización por scope la
aplica el caso de uso ANTES de llamar al repo. El CRUD de puntos es atómico
(tres tablas), por eso vive detrás de un método por operación.
"""

from __future__ import annotations

from typing import Protocol

from domain.context.delivery_points import Direccion


class JerarquiaRepo(Protocol):
    # --- Lecturas de la jerarquía --------------------------------------------
    def countries_global(self) -> list[dict]:
        """Todos los países (para scopes globales)."""
        ...

    def countries_por_ids(self, ids: list[str]) -> list[dict]:
        """Países cuyo id está en la lista (scopes acotados)."""
        ...

    def warehouses(self, country_id: str) -> list[dict]:
        ...

    def customers(self, warehouse_id: str) -> list[dict]:
        ...

    def final_customers(self, customer_id: str) -> list[dict]:
        ...

    def final_customer_owner(self, final_customer_id: str) -> str | None:
        """customer_id dueño de un cliente final, o None si no existe."""
        ...

    def delivery_points(self, final_customer_id: str) -> list[dict]:
        ...

    # --- CRUD de puntos de entrega (atómico) ---------------------------------
    def customer_country(self, customer_id: str) -> str | None:
        """País del cliente (para el filtro de países del rol y el alta de dirección)."""
        ...

    def point(self, point_id: str) -> dict | None:
        """Punto de entrega con su dirección y cliente dueño, o None."""
        ...

    def create_point(self, customer_id: str, external_code: str, name: str,
                     direccion: Direccion, delivery_instructions: object,
                     zone_id: object, route_code: object) -> dict:
        """Crea (o reutiliza) el cliente final, su dirección y el punto en una
        transacción. Devuelve el punto creado. Lanza si el código ya existe."""
        ...

    def update_point(self, point: dict, fields: dict, direccion: Direccion | None) -> dict:
        """Actualiza campos del punto y, si viene, su dirección (atómico)."""
        ...

    def delete_point(self, point: dict) -> None:
        """Borra el punto y su dirección (atómico)."""
        ...
