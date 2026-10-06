"""Ports (interfaces) del dominio: contratos que los adaptadores outbound
implementan. El dominio y los casos de uso dependen de estos Protocols, nunca de
psycopg ni de Aurora directamente (inversión de dependencias hexagonal).
"""

from ports.credencial_repo import Credential, CredencialRepo
from ports.data_repo import DataRepo
from ports.jerarquia_repo import JerarquiaRepo
from ports.pedido_repo import PedidoRepo
from ports.plan_repo import PlanRepo
from ports.vehiculo_repo import VehiculoRepo
from ports.zona_repo import ZonaRepo

__all__ = ["PedidoRepo", "VehiculoRepo", "ZonaRepo", "PlanRepo", "CredencialRepo",
           "Credential", "JerarquiaRepo", "DataRepo"]
