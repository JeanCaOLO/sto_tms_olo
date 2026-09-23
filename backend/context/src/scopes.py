"""Contexto operativo (scopes) del usuario y su autorización.

Portado de server/domain/context/{resolve,authorize}OperationalContext.mjs.
ROLE (qué puede hacer) va separado de SCOPE (dónde puede hacerlo). Un scope
con país/almacén/cliente todos null es GLOBAL. Fail-closed: sin scopes, nada.
"""

from dataclasses import asdict, dataclass

from tms_common import pg
from tms_common.errors import HttpError


@dataclass(frozen=True)
class Scope:
    id: str
    roleId: str | None
    countryId: str | None
    warehouseId: str | None
    customerId: str | None


@dataclass(frozen=True)
class Chain:
    countryId: str | None = None
    warehouseId: str | None = None
    customerId: str | None = None


def _text(value: object) -> str | None:
    return None if value is None else str(value)


def resolve_scopes(user: dict) -> list[Scope]:
    users = pg.query("SELECT id, organization_id FROM app_users WHERE auth_user_id = %s", [user["id"]])
    if not users:
        raise HttpError(401, "No existe app_user para este usuario autenticado.")
    rows = pg.query(
        "SELECT id, role_id, country_id, warehouse_id, customer_id FROM user_scopes WHERE app_user_id = %s",
        [users[0]["id"]],
    )
    return [
        Scope(_text(r["id"]), _text(r["role_id"]), _text(r["country_id"]),
              _text(r["warehouse_id"]), _text(r["customer_id"]))
        for r in rows
    ]


def is_global(scope: Scope) -> bool:
    return not scope.countryId and not scope.warehouseId and not scope.customerId


def resolve_chain(country_id: str | None = None, warehouse_id: str | None = None,
                  customer_id: str | None = None) -> Chain:
    """Cadena completa país/almacén/cliente de una entidad, para compararla con
    scopes de cualquier nivel (un scope de país cubre sus almacenes y clientes)."""
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
    if scope.customerId:
        return scope.customerId == chain.customerId
    if scope.warehouseId:
        return scope.warehouseId == chain.warehouseId
    return bool(scope.countryId) and scope.countryId == chain.countryId


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
