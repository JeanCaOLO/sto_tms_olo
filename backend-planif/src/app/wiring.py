"""Composición (wiring): arma el `PlanificacionService` con los adaptadores
Aurora concretos y resuelve el contexto operativo desde el scope del usuario.

Este es el único punto donde la capa de aplicación conoce a los adaptadores
concretos; los casos de uso solo ven ports. Reemplazar aquí por dobles de prueba
en tests.
"""

from __future__ import annotations

import os

from app.planificacion_service import Contexto, PlanificacionService
from app.auth_service import AuthService
from app.context_service import ContextService
from app.data_service import DataService
from app.admin_service import AdminService
from app.eflow_service import EflowService
from adapters.outbound.aurora.credencial_repo import AuroraCredencialRepo
from adapters.outbound.aurora.data_repo import AuroraDataRepo
from adapters.outbound.aurora.jerarquia_repo import AuroraJerarquiaRepo
from adapters.outbound.aurora.pedido_repo import AuroraPedidoRepo
from adapters.outbound.aurora.plan_repo import AuroraPlanRepo
from adapters.outbound.aurora.vehiculo_repo import AuroraVehiculoRepo
from adapters.outbound.aurora.zona_repo import AuroraZonaRepo
from adapters.outbound.aurora.admin_repo import AuroraAdminRepo
from lib.tms_common import pg
from lib.tms_common.config import jwt_secret
from lib.tms_common.errors import HttpError
from lib.tms_common.event import auth_user, header, query_params
from lib.tms_common.scopes import authorize


def build_service() -> PlanificacionService:
    return PlanificacionService(
        pedidos=AuroraPedidoRepo(),
        vehiculos=AuroraVehiculoRepo(),
        planes=AuroraPlanRepo(),
        zonas=AuroraZonaRepo(),
    )


def build_auth_service() -> AuthService:
    return AuthService(credenciales=AuroraCredencialRepo(), jwt_secret=jwt_secret())


def build_context_service() -> ContextService:
    return ContextService(jerarquia=AuroraJerarquiaRepo())


def build_data_service() -> DataService:
    return DataService(repo=AuroraDataRepo())


def build_admin_service() -> AdminService:
    return AdminService(repo=AuroraAdminRepo())


def build_eflow_service() -> EflowService:
    """Fuente EFLOW según EFLOW_MODE: mock (default, sin red) o live (SQL Server).
    Los adaptadores se importan aquí para no cargar el de live (pytds) en mock."""
    if os.environ.get("EFLOW_MODE", "mock") == "live":
        from adapters.outbound.eflow.live_source import LiveEflowSource
        return EflowService(source=LiveEflowSource())
    from adapters.outbound.eflow.mock_source import MockEflowSource
    return EflowService(source=MockEflowSource())


def _organization(user: dict) -> str:
    rows = pg.query(
        "SELECT organization_id FROM app_users WHERE auth_user_id = %s", [user["id"]]
    )
    if not rows:
        raise HttpError(401, "No existe app_user para este usuario autenticado.")
    return str(rows[0]["organization_id"])


def resolve_context(event: dict) -> Contexto:
    """Contexto operativo desde el token + headbar (§0: NO hay ?pais).

    El almacén activo llega como `warehouse_id` (query o body). Se autoriza
    contra los scopes del usuario (fail-closed) y se deriva el país de la cadena.
    """
    user = auth_user(event)
    warehouse_id = _warehouse_id(event)
    country_id = None
    if warehouse_id:
        chain = authorize(user, warehouse_id=warehouse_id)
        country_id = chain.country_id
    return Contexto(
        organization_id=_organization(user),
        warehouse_id=warehouse_id,
        country_id=country_id,
        customer_id=_customer_id(event),
        user_id=user["id"],
    )


def _warehouse_id(event: dict) -> str | None:
    params = query_params(event)
    warehouse = params.get("warehouse_id") or params.get("almacen_id")
    if warehouse:
        return warehouse
    body = event.get("_parsed_body") or {}
    return body.get("warehouse_id") or body.get("almacen_id") or header(event, "x-warehouse-id")


def _customer_id(event: dict) -> str | None:
    """Compañía activa del headbar: header x-customer-id (o query/body)."""
    params = query_params(event)
    body = event.get("_parsed_body") or {}
    return (
        params.get("customer_id")
        or body.get("customer_id")
        or header(event, "x-customer-id")
    )
