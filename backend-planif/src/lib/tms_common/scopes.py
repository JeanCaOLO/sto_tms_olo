"""Contexto operativo (scopes) del usuario y su autorización.

Portado de `origin/main:backend/context/src/scopes.py`. ROLE (qué puede hacer)
va separado de SCOPE (dónde). Un scope con país/almacén/cliente todos null es
GLOBAL. Fail-closed: sin scopes, nada. El país sale de acá, NO de `?pais`.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass

from lib.tms_common import pg
from lib.tms_common.errors import HttpError


@dataclass(frozen=True)
class Scope:
    id: str
    role_id: str | None
    country_id: str | None
    warehouse_id: str | None
    customer_id: str | None


@dataclass(frozen=True)
class Chain:
    country_id: str | None = None
    warehouse_id: str | None = None
    customer_id: str | None = None


def _text(value: object) -> str | None:
    return None if value is None else str(value)


def resolve_scopes(user: dict) -> list[Scope]:
    users = pg.query(
        "SELECT id, organization_id FROM app_users WHERE auth_user_id = %s", [user["id"]]
    )
    if not users:
        raise HttpError(401, "No existe app_user para este usuario autenticado.")
    rows = pg.query(
        "SELECT id, role_id, country_id, warehouse_id, customer_id "
        "FROM user_scopes WHERE app_user_id = %s",
        [users[0]["id"]],
    )
    return [
        Scope(_text(r["id"]), _text(r["role_id"]), _text(r["country_id"]),
              _text(r["warehouse_id"]), _text(r["customer_id"]))
        for r in rows
    ]


def is_global(scope: Scope) -> bool:
    return not scope.country_id and not scope.warehouse_id and not scope.customer_id


def resolve_chain(country_id: str | None = None, warehouse_id: str | None = None,
                  customer_id: str | None = None) -> Chain:
    """Cadena país/almacén/cliente de una entidad, para compararla con scopes de
    cualquier nivel (un scope de país cubre sus almacenes y clientes)."""
    if customer_id:
        rows = pg.query(
            "SELECT c.id AS customer_id, w.id AS warehouse_id, w.country_id AS country_id "
            "FROM customers c LEFT JOIN warehouses w ON w.id = c.warehouse_id WHERE c.id = %s",
            [customer_id],
        )
        if not rows:
            raise HttpError(404, f"Cliente no encontrado: {customer_id}")
        row = rows[0]
        return Chain(_text(row["country_id"]), _text(row["warehouse_id"]), _text(row["customer_id"]))
    if warehouse_id:
        rows = pg.query("SELECT id, country_id FROM warehouses WHERE id = %s", [warehouse_id])
        if not rows:
            raise HttpError(404, f"Almacén no encontrado: {warehouse_id}")
        return Chain(_text(rows[0]["country_id"]), _text(rows[0]["id"]))
    return Chain(country_id)


def covers(scope: Scope, chain: Chain) -> bool:
    if is_global(scope):
        return True
    if scope.customer_id:
        return scope.customer_id == chain.customer_id
    if scope.warehouse_id:
        return scope.warehouse_id == chain.warehouse_id
    return bool(scope.country_id) and scope.country_id == chain.country_id


def authorize(user: dict, **requested: str) -> Chain:
    scopes = resolve_scopes(user)
    if not scopes:
        raise HttpError(403, "El usuario no tiene ningún scope operativo asignado.")
    chain = resolve_chain(**requested)
    if not any(covers(scope, chain) for scope in scopes):
        raise HttpError(403, "El usuario no tiene acceso a este país/almacén/cliente.")
    return chain


def scopes_payload(scopes: list[Scope]) -> list[dict]:
    return [asdict(scope) for scope in scopes]
