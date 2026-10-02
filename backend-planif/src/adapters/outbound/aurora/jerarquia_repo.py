"""Adaptador Aurora del port JerarquiaRepo (jerarquía + CRUD de puntos de entrega).

SQL parametrizado (pg8000). Las escrituras de un punto tocan tres tablas
(final_customers, addresses, delivery_points) y van en una transacción
(`pg.transaction`). Portado de las queries de `origin/main:backend/context`.
"""

from __future__ import annotations

from domain.context.delivery_points import Direccion
from adapters.outbound.aurora import jerarquia_sql as sql
from lib.tms_common import pg
from lib.tms_common.errors import HttpError


class AuroraJerarquiaRepo:
    """Implementa `ports.JerarquiaRepo`."""

    # --- Lecturas ------------------------------------------------------------
    def countries_global(self) -> list[dict]:
        return pg.query(sql.COUNTRIES_SQL.format(scope_clause=""), [])

    def countries_por_ids(self, ids: list[str]) -> list[dict]:
        return pg.query(sql.COUNTRIES_SQL.format(scope_clause="AND id::text = ANY(%s)"), [ids])

    def warehouses(self, country_id: str) -> list[dict]:
        return pg.query(sql.WAREHOUSES_SQL, [country_id])

    def customers(self, warehouse_id: str) -> list[dict]:
        return pg.query(sql.CUSTOMERS_SQL, [warehouse_id])

    def final_customers(self, customer_id: str) -> list[dict]:
        return pg.query(sql.FINAL_CUSTOMERS_SQL, [customer_id])

    def final_customer_owner(self, final_customer_id: str) -> str | None:
        rows = pg.query(sql.FINAL_CUSTOMER_OWNER_SQL, [final_customer_id])
        return str(rows[0]["customer_id"]) if rows else None

    def delivery_points(self, final_customer_id: str) -> list[dict]:
        return pg.query(sql.DELIVERY_POINTS_SQL, [final_customer_id])

    # --- CRUD de puntos ------------------------------------------------------
    def customer_country(self, customer_id: str) -> str | None:
        rows = pg.query(sql.CUSTOMER_COUNTRY_SQL, [customer_id])
        return rows[0]["country_id"] if rows else None

    def point(self, point_id: str) -> dict | None:
        rows = pg.query(sql.POINT_SQL, [point_id])
        return rows[0] if rows else None

    def _final_customer(self, run: pg.Runner, customer_id: str, code: str, name: str) -> str:
        found = run(sql.FIND_FINAL_CUSTOMER_SQL, [customer_id, code])
        if found:
            return str(found[0]["id"])
        return str(run(sql.INSERT_FINAL_CUSTOMER_SQL, [customer_id, code, name])[0]["id"])

    def create_point(self, customer_id: str, external_code: str, name: str,
                     direccion: Direccion, delivery_instructions: object,
                     zone_id: object, route_code: object) -> dict:
        country = self.customer_country(customer_id)
        with pg.transaction() as run:
            fc_id = self._final_customer(run, customer_id, external_code, name)
            if run(sql.POINT_EXISTS_SQL, [fc_id, external_code]):
                raise HttpError(409, f'El cliente ya tiene un punto de entrega con código "{external_code}".')
            address_id = run(sql.INSERT_ADDRESS_SQL, [country, *direccion.as_params()])[0]["id"]
            point_id = run(sql.INSERT_POINT_SQL, [fc_id, address_id, external_code, name,
                                                  delivery_instructions, zone_id or None,
                                                  route_code or None, fc_id])[0]["id"]
        created = self.point(str(point_id))
        if created is None:
            raise HttpError(500, "No se pudo leer el punto recién creado.")
        return created

    def update_point(self, point: dict, fields: dict, direccion: Direccion | None) -> dict:
        with pg.transaction() as run:
            if fields:
                # Los nombres de columna salen de POINT_FIELDS (lista blanca del
                # dominio), nunca de texto crudo del cliente.
                assignments = ", ".join(f"{column} = %s" for column in fields)
                run(f"UPDATE delivery_points SET {assignments}, updated_at = now() WHERE id = %s",
                    [*fields.values(), point["id"]])
            if direccion is not None and point["address_id"]:
                run(sql.UPDATE_ADDRESS_SQL, [*direccion.as_params(), point["address_id"]])
        updated = self.point(str(point["id"]))
        if updated is None:
            raise HttpError(500, "No se pudo leer el punto actualizado.")
        return updated

    def delete_point(self, point: dict) -> None:
        with pg.transaction() as run:
            run(sql.DELETE_POINT_SQL, [point["id"]])
            if point["address_id"]:
                run(sql.DELETE_ADDRESS_SQL, [point["address_id"]])
