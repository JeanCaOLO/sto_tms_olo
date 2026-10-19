"""ColaCandidatos — adaptador de LECTURA de la cola del OMS (esqueleto).

Contrato (US1, v4 — confirmado con negocio):
- Entrada: límite.
- Salida: lista de PedidoCandidato elegibles para priorizar (la "cola").
- Errores: propaga HttpError si Aurora falla; el mock no falla.

Activación por POLLING de columna sobre `public.orders` (Aurora tms_olo). La cola
es exactamente los pedidos que Planificación ya corrió y el OMS todavía no procesó:

    WHERE planning_run_id IS NOT NULL     -- Planificación ya los corrió
      AND oms_processed_at IS NULL        -- el OMS aún no los priorizó

Esa columna es la ÚNICA fuente de verdad de activación. EventBridge/evento queda
como mejora futura con infra; NO es requisito de v1 y no bloquea. El OMS ya NO lee
de EXPEDICIONESCABECERA con TPEXES/TPEXSI='DISP' ni filtra por NUMEROVIAJEWMH:
ese filtro viejo quedó eliminado del contrato.

El número de viaje es `orders.numero_viaje` (formato 'YYYYMMDD-NNN'), NO
wms_trip_number (columna eliminada, ADR-0004 de Planificación).

Modo mock vs live (patrón del backend): OMS_SOURCE=live consulta Aurora real (vía
el helper pg del Layer tms_common); por default (mock) sirve datos fijos sin tocar
nada, coherentes con el modelo v4.
"""

from __future__ import annotations

import os
from datetime import datetime, timezone

from models import PedidoCandidato

# SQL de la cola v4: polling de columna sobre public.orders. Expone la llave EFLOW,
# numero_viaje, lead_time_days (dinámico), delivery_date, observaciones, scope.
COLA_SQL = """
SELECT o.eflow_id_almacen,
       o.eflow_id_compania,
       o.eflow_id_sucursal,
       o.eflow_id_expedicion,
       o.delivery_date,
       o.lead_time_days,
       o.numero_viaje,
       o.planning_run_id,
       o.oms_processed_at,
       o.observaciones,
       o.delivery_zone,
       fc.customer_type,
       o.total_weight,
       o.total_volume,
       o.warehouse_id,
       o.customer_id
FROM orders o
LEFT JOIN final_customers fc ON fc.id = o.final_customer_id
WHERE o.planning_run_id IS NOT NULL
  AND o.oms_processed_at IS NULL
ORDER BY o.delivery_date NULLS LAST
LIMIT %s
"""


def _modo_live() -> bool:
    return os.environ.get("OMS_SOURCE", "mock") == "live"


def candidatos(*, limite: int = 100) -> list[PedidoCandidato]:
    """Devuelve la cola de pedidos candidatos a priorizar.

    En modo mock (default) sirve un dataset fijo; en `live` consulta public.orders
    con el filtro de polling (planning_run_id IS NOT NULL AND oms_processed_at IS NULL).
    """
    if _modo_live():
        from tms_common import pg  # import local: el esqueleto corre sin el Layer en tests

        filas = pg.query(COLA_SQL, [limite])
        return [_desde_fila(f) for f in filas]
    return _mock_candidatos()[:limite]


def _desde_fila(fila: dict) -> PedidoCandidato:
    """Mapea una fila de public.orders a PedidoCandidato (la llave EFLOW es la PK)."""
    return PedidoCandidato(
        id_almacen=fila["eflow_id_almacen"],
        id_compania=fila["eflow_id_compania"],
        id_sucursal=fila["eflow_id_sucursal"],
        id_expedicion=fila["eflow_id_expedicion"],
        fecha_expedicion_planificada=fila["delivery_date"],
        lead_time_days=fila.get("lead_time_days"),
        numero_viaje=fila.get("numero_viaje"),
        planning_run_id=fila.get("planning_run_id"),
        oms_processed_at=fila.get("oms_processed_at"),
        observaciones=fila.get("observaciones"),
        delivery_zone=fila.get("delivery_zone"),
        customer_type=fila.get("customer_type"),
        peso_total=fila.get("total_weight"),
        cubicaje_total=fila.get("total_volume"),
        warehouse_id=fila.get("warehouse_id"),
        customer_id=fila.get("customer_id"),
    )


def _mock_candidatos() -> list[PedidoCandidato]:
    """Dataset fijo del esqueleto: cubre los caminos que prueban las reglas.

    Todos traen planning_run_id (ya corridos por Planificación) y oms_processed_at
    NULL (aún no priorizados): así reflejan la cola v4. Incluye: un pedido urgente
    (entrega mañana), uno con margen, uno con fecha centinela (fallback), y uno con
    observación de cliente retira. lead_time_days dinámico (uno NULL → default).
    """
    _ = datetime(2026, 10, 1, 12, 0, tzinfo=timezone.utc)  # ancla temporal de referencia
    return [
        PedidoCandidato(
            id_almacen="0001", id_compania="0109", id_sucursal="0001", id_expedicion="1001",
            fecha_expedicion_planificada=datetime(2026, 10, 2, 0, 0, tzinfo=timezone.utc),
            lead_time_days=1, numero_viaje="20261002-001", planning_run_id="plan-2026-10-01-a",
            observaciones="Entregar en recepción", delivery_zone="GAM", customer_type="MAYOREO",
            peso_total=120.5, cubicaje_total=1.2,
            country_id="cr", warehouse_id="w1", customer_id="cofersa",
        ),
        PedidoCandidato(
            id_almacen="0001", id_compania="0109", id_sucursal="0001", id_expedicion="1002",
            fecha_expedicion_planificada=datetime(2026, 10, 10, 0, 0, tzinfo=timezone.utc),
            lead_time_days=3, numero_viaje="20261010-002", planning_run_id="plan-2026-10-01-a",
            observaciones=None, delivery_zone="Guanacaste", customer_type="TIENDA",
            peso_total=None, cubicaje_total=None,
            country_id="cr", warehouse_id="w1", customer_id="epa",
        ),
        PedidoCandidato(
            id_almacen="0002", id_compania="0109", id_sucursal="0001", id_expedicion="1003",
            fecha_expedicion_planificada=datetime(1900, 1, 1, 0, 0, tzinfo=timezone.utc),
            lead_time_days=None, numero_viaje=None, planning_run_id="plan-2026-10-01-a",
            observaciones="", delivery_zone="GAM", customer_type="MAYOREO",
            peso_total=None, cubicaje_total=None,
            country_id="cr", warehouse_id="w2", customer_id="cofersa",
        ),
        PedidoCandidato(
            id_almacen="0001", id_compania="0109", id_sucursal="0001", id_expedicion="1004",
            fecha_expedicion_planificada=datetime(2026, 10, 8, 0, 0, tzinfo=timezone.utc),
            lead_time_days=2, numero_viaje="20261008-004", planning_run_id="plan-2026-10-01-a",
            observaciones="El cliente retira en bodega el viernes", delivery_zone="La Fortuna",
            customer_type="TIENDA", peso_total=50.0, cubicaje_total=0.4,
            country_id="cr", warehouse_id="w1", customer_id="epa",
        ),
    ]
