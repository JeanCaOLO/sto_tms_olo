"""ColaCandidatos — adaptador de LECTURA de EFLOW/WMS (esqueleto, contra mock).

Contrato (US1):
- Entrada: país/scope (opcional) + límite.
- Salida: lista de PedidoCandidato elegibles para priorizar (la "cola").
- Errores: propaga HttpError si la fuente real falla; el mock no falla.

Filtro de la cola (del DDL real EXPEDICIONESCABECERA):
    TPEXES = 'DISP' AND TPEXSI = 'DISP'      -- estado y situación = disponible
    AND FECHACIERRE IS NULL                   -- no cerrada
    AND NUMEROVIAJEWMH IS NULL                -- sin viaje asignado
Equivale al anti-join con ALMACENMOVIMIENTOS_CARCAM (los NO procesados) por la PK
(IDALMACEN, IDCOMPANIA, IDSUCURSAL, IDEXPEDICION).

Modo mock vs live (patrón del backend/eflow): OMS_SOURCE=live consulta EFLOW real
(SQL Server, requiere VPC); por default (mock) sirve datos fijos sin tocar nada.
La RÉPLICA de EFLOW_OLO aún no existe (OQ-2).

TODO(EFLOW real): implementar la lectura `live` contra EFLOW/réplica. Reactivar
nfr/infra-design antes de conectar datos reales (ver external-dependency-map.md).
"""

from __future__ import annotations

import os
from datetime import datetime, timezone

from models import PedidoCandidato

# SQL de referencia para la implementación `live` (no se ejecuta en el esqueleto).
COLA_SQL = """
SELECT IDALMACEN, IDCOMPANIA, IDSUCURSAL, IDEXPEDICION,
       FECHAEXPEDICIONPLANIFICADA, OBSERVACIONESEXPEDICION,
       PESOPEDIDO_TOTAL, CUBICAJEPEDIDO_TOTAL
FROM EXPEDICIONESCABECERA
WHERE TPEXES = 'DISP' AND TPEXSI = 'DISP'
  AND FECHACIERRE IS NULL
  AND NUMEROVIAJEWMH IS NULL
"""


def _modo_live() -> bool:
    return os.environ.get("OMS_SOURCE", "mock") == "live"


def candidatos(*, limite: int = 100) -> list[PedidoCandidato]:
    """Devuelve la cola de pedidos candidatos a priorizar.

    En modo mock (default) sirve un dataset fijo; en `live` consultaría EFLOW.
    """
    if _modo_live():
        # TODO(EFLOW real): leer de EFLOW/réplica con COLA_SQL y mapear a PedidoCandidato.
        raise NotImplementedError(
            "OMS_SOURCE=live aún no implementado: la réplica de EFLOW_OLO no existe (OQ-2). "
            "Reactivar nfr/infra-design antes de conectar datos reales."
        )
    return _mock_candidatos()[:limite]


def _mock_candidatos() -> list[PedidoCandidato]:
    """Dataset fijo del esqueleto: cubre los caminos que prueban las reglas.

    Incluye: un pedido urgente (entrega mañana), uno con margen, uno con fecha
    centinela (fallback), y uno con observación de cliente retira.
    """
    base = datetime(2026, 10, 1, 12, 0, tzinfo=timezone.utc)
    return [
        PedidoCandidato(
            id_almacen=1, id_compania=10, id_sucursal=1, id_expedicion=1001,
            fecha_expedicion_planificada=datetime(2026, 10, 2, 0, 0, tzinfo=timezone.utc),
            observaciones="Entregar en recepción", peso_total=120.5, cubicaje_total=1.2,
            country_id="cr", warehouse_id="w1", customer_id="cofersa",
        ),
        PedidoCandidato(
            id_almacen=1, id_compania=10, id_sucursal=1, id_expedicion=1002,
            fecha_expedicion_planificada=datetime(2026, 10, 10, 0, 0, tzinfo=timezone.utc),
            observaciones=None, peso_total=None, cubicaje_total=None,
            country_id="cr", warehouse_id="w1", customer_id="epa",
        ),
        PedidoCandidato(
            id_almacen=2, id_compania=10, id_sucursal=1, id_expedicion=1003,
            fecha_expedicion_planificada=datetime(1900, 1, 1, 0, 0, tzinfo=timezone.utc),
            observaciones="", peso_total=None, cubicaje_total=None,
            country_id="cr", warehouse_id="w2", customer_id="cofersa",
        ),
        PedidoCandidato(
            id_almacen=1, id_compania=10, id_sucursal=1, id_expedicion=1004,
            fecha_expedicion_planificada=datetime(2026, 10, 8, 0, 0, tzinfo=timezone.utc),
            observaciones="El cliente retira en bodega el viernes", peso_total=50.0, cubicaje_total=0.4,
            country_id="cr", warehouse_id="w1", customer_id="epa",
        ),
    ]
