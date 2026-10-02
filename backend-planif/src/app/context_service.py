"""Casos de uso del contexto operativo: jerarquía filtrada por scope + CRUD de puntos.

Orquesta la infra de scopes/permissions (`lib/tms_common`) con el port de la
jerarquía y el dominio de puntos de entrega. No conoce HTTP ni SQL: recibe el
`user` (del token) y el `event` solo donde la matriz de permisos lo exige.
"""

from __future__ import annotations

from domain.context.delivery_points import (MODULE, Direccion, campos_editables,
                                             direccion_desde, requerido)
from ports.jerarquia_repo import JerarquiaRepo
from lib.tms_common import permissions
from lib.tms_common.errors import HttpError
from lib.tms_common.scopes import (authorize, is_global, resolve_scopes, scopes_payload)


class ContextService:
    def __init__(self, jerarquia: JerarquiaRepo) -> None:
        self._jerarquia = jerarquia

    # --- Jerarquía (filtrada por el scope operativo del usuario) -------------
    def list_countries(self, user: dict) -> list[dict]:
        scopes = resolve_scopes(user)
        if any(is_global(scope) for scope in scopes):
            return self._jerarquia.countries_global()
        ids = sorted({scope.country_id for scope in scopes if scope.country_id})
        if not ids:
            return []  # sin scope de país -> nada
        return self._jerarquia.countries_por_ids(list(ids))

    def list_warehouses(self, user: dict, country_id: str) -> list[dict]:
        authorize(user, country_id=country_id)
        return self._jerarquia.warehouses(country_id)

    def list_customers(self, user: dict, warehouse_id: str) -> list[dict]:
        authorize(user, warehouse_id=warehouse_id)
        return self._jerarquia.customers(warehouse_id)

    def list_final_customers(self, user: dict, customer_id: str) -> list[dict]:
        authorize(user, customer_id=customer_id)
        return self._jerarquia.final_customers(customer_id)

    def list_delivery_points(self, user: dict, final_customer_id: str) -> list[dict]:
        owner = self._jerarquia.final_customer_owner(final_customer_id)
        if owner is None:
            raise HttpError(404, f"Cliente final no encontrado: {final_customer_id}")
        # final_customers no trae país/almacén propio: se autoriza vía su customer.
        authorize(user, customer_id=owner)
        return self._jerarquia.delivery_points(final_customer_id)

    def my_context(self, user: dict) -> dict:
        return {"scopes": scopes_payload(resolve_scopes(user))}

    # --- CRUD de puntos de entrega -------------------------------------------
    def _require(self, event: dict, action: str, country_id: object = None) -> None:
        caller = permissions.for_event(event)
        caller.require(MODULE, action)
        allowed = caller.country_filter
        if allowed is not None and country_id is not None and str(country_id) not in allowed:
            raise HttpError(403, "Tu rol no tiene acceso a ese país.")

    def create_point(self, event: dict, user: dict, body: dict) -> dict:
        customer_id = requerido(body, "customer_id", "El cliente")
        authorize(user, customer_id=customer_id)
        code = requerido(body, "external_code", "El código")
        name = requerido(body, "name", "El nombre")
        direccion = direccion_desde(body.get("address") or {})
        country = self._jerarquia.customer_country(customer_id)
        self._require(event, "create", country)
        return self._jerarquia.create_point(
            customer_id, code, name, direccion,
            body.get("delivery_instructions"), body.get("zone_id"), body.get("route_code"),
        )

    def _authorized_point(self, event: dict, user: dict, point_id: str, action: str) -> dict:
        point = self._jerarquia.point(point_id)
        if point is None:
            raise HttpError(404, "Punto de entrega no encontrado")
        self._require(event, action, point.get("country_id"))
        authorize(user, customer_id=str(point["customer_id"]))
        return point

    def update_point(self, event: dict, user: dict, point_id: str, body: dict) -> dict:
        point = self._authorized_point(event, user, point_id, "edit")
        fields = campos_editables(body)
        direccion: Direccion | None = None
        if isinstance(body.get("address"), dict):
            direccion = direccion_desde(body["address"])
        return self._jerarquia.update_point(point, fields, direccion)

    def delete_point(self, event: dict, user: dict, point_id: str) -> dict:
        point = self._authorized_point(event, user, point_id, "delete")
        self._jerarquia.delete_point(point)
        return {"id": str(point["id"])}
