"""Casos de uso de Planificación 2 (contrato §4), orquestando dominio + ports.

Un `PlanificacionService` agrupa los casos porque comparten los mismos cuatro
ports. Cada método es un caso de uso; ninguno toca HTTP ni SQL.
"""

from __future__ import annotations

from dataclasses import dataclass, replace

from domain.models import Pedido, Plan
from domain.planes import estados
from domain.planificacion import motor
from ports import PedidoRepo, PlanRepo, VehiculoRepo, ZonaRepo


class PlanNoEncontrado(Exception):
    def __init__(self, plan_id: str):
        super().__init__(f"Plan no encontrado: {plan_id}")
        self.plan_id = plan_id


class PlanNoEditable(Exception):
    def __init__(self, status: str):
        super().__init__(f"El plan no es editable en estado '{status}' (solo en draft).")
        self.status = status


@dataclass(frozen=True)
class Contexto:
    """Contexto operativo resuelto desde el scope del usuario (§0: sin ?pais)."""

    organization_id: str
    warehouse_id: str | None = None
    country_id: str | None = None
    customer_id: str | None = None  # compañía activa (país → almacén → compañía)
    user_id: str | None = None


class PlanificacionService:
    def __init__(
        self,
        pedidos: PedidoRepo,
        vehiculos: VehiculoRepo,
        planes: PlanRepo,
        zonas: ZonaRepo,
    ) -> None:
        self._pedidos = pedidos
        self._vehiculos = vehiculos
        self._planes = planes
        self._zonas = zonas

    # Serializa un plan enriqueciendo viajes (capacidad del vehículo) y paradas
    # (coords/nombre del pedido) — el frontend necesita esos datos para las
    # barras de capacidad y el mapa, tanto en un plan recién creado como en uno
    # ya guardado (pestaña Planificaciones).
    def a_dict(self, plan: Plan) -> dict:
        from app.serializers import plan_to_dict
        vehiculos = {v.id: v for v in self._vehiculos.disponibles(plan.organization_id, plan.warehouse_id)}
        order_ids = [p.order_id for t in plan.viajes for p in t.paradas]
        pedidos = {p.id: p for p in self._pedidos.por_ids(order_ids)}
        return plan_to_dict(plan, vehiculos, pedidos)

    # GET /pedidos?fecha_entrega=   (solo pedidos de la compañía activa)
    def listar_pedidos(self, ctx: Contexto, plan_date: str) -> list[Pedido]:
        return self._pedidos.planificables(
            ctx.organization_id, ctx.warehouse_id, plan_date, ctx.customer_id
        )

    # GET /pedidos/{id}/articulos  → líneas del pedido (order_items)
    def articulos_de_pedido(self, order_id: str) -> list[dict]:
        return self._pedidos.articulos_de(order_id)

    # Congela el dato de pedido/vehículo en cada parada/viaje al momento de
    # guardar, para que el plan sea un registro inmutable de lo despachado.
    def _congelar(self, plan: Plan, pedidos_por_id: dict, vehiculos_por_id: dict) -> Plan:
        viajes = []
        for v in plan.viajes:
            veh = vehiculos_por_id.get(v.vehicle_id)
            paradas = []
            for p in v.paradas:
                ped = pedidos_por_id.get(p.order_id)
                paradas.append(replace(
                    p,
                    order_number=(ped.order_number if ped else None),
                    customer_name=(ped.customer_name if ped else None),
                    delivery_address=(ped.delivery_address if ped else None),
                    delivery_city=(ped.delivery_city if ped else None),
                    delivery_zone=(ped.delivery_zone if ped else None),
                    delivery_latitude=(ped.delivery_latitude if ped else None),
                    delivery_longitude=(ped.delivery_longitude if ped else None),
                    total_weight=(ped.total_weight if ped else None),
                    total_volume=(ped.total_volume if ped else None),
                ))
            viajes.append(replace(
                v,
                paradas=tuple(paradas),
                vehicle_plate=(veh.label if veh else None),
                vehicle_capacity_weight=(veh.capacity_weight if veh else None),
                vehicle_capacity_volume=(veh.capacity_volume if veh else None),
                is_owned=(veh.is_owned if veh else None),
            ))
        return replace(plan, viajes=tuple(viajes))

    # POST /planes  → corre el motor sobre los pedidos de la compañía y persiste un draft
    def crear_plan(self, ctx: Contexto, plan_date: str) -> Plan:
        pedidos = self._pedidos.planificables(
            ctx.organization_id, ctx.warehouse_id, plan_date, ctx.customer_id
        )
        vehiculos = self._vehiculos.disponibles(ctx.organization_id, ctx.warehouse_id)
        plan = motor.generar_plan(
            plan_date=plan_date,
            pedidos=pedidos,
            vehiculos=vehiculos,
            warehouse_id=ctx.warehouse_id,
            country_id=ctx.country_id,
            organization_id=ctx.organization_id,
            customer_id=ctx.customer_id,
            created_by=ctx.user_id,
        )
        plan = self._congelar(plan, {p.id: p for p in pedidos}, {v.id: v for v in vehiculos})
        guardado = self._planes.guardar(plan)
        # El id/fechas salen de la persistencia; los sin_asignar del motor.
        return replace(guardado, sin_asignar=plan.sin_asignar)

    # GET /planes?status=&fecha=   (solo planes de la compañía activa)
    def listar_planes(self, ctx: Contexto, status: str | None, plan_date: str | None) -> list[Plan]:
        return self._planes.listar(
            ctx.organization_id, ctx.warehouse_id, status, plan_date, ctx.customer_id
        )

    # GET /planes/{id}
    def obtener_plan(self, plan_id: str) -> Plan:
        plan = self._planes.obtener(plan_id)
        if plan is None:
            raise PlanNoEncontrado(plan_id)
        return plan

    # PUT /planes/{id}  → reasigna pedidos a viajes, revalida capacidad y reordena
    def editar_plan(self, plan_id: str, asignaciones: list[dict]) -> Plan:
        plan = self.obtener_plan(plan_id)
        if not estados.es_editable(plan.status):
            raise PlanNoEditable(plan.status)
        order_ids = [oid for a in asignaciones for oid in a.get("order_ids", [])]
        pedidos = {p.id: p for p in self._pedidos.por_ids(order_ids)}
        vehiculos = {v.id: v for v in self._vehiculos.disponibles(plan.organization_id, plan.warehouse_id)}
        reconstruido = motor.generar_plan_desde_asignaciones(
            plan_date=plan.plan_date,
            asignaciones=asignaciones,
            pedidos_por_id=pedidos,
            vehiculos=vehiculos,
            base=plan,
        )
        reconstruido = self._congelar(reconstruido, pedidos, vehiculos)
        actualizado = self._planes.reemplazar_viajes(plan_id, reconstruido)
        return replace(actualizado, sin_asignar=reconstruido.sin_asignar)

    # POST /planes/{id}/confirmar | completar | cancelar
    def transicionar(self, plan_id: str, destino: str) -> Plan:
        plan = self.obtener_plan(plan_id)
        nuevo = estados.transicionar(plan.status, destino)
        return self._planes.actualizar_estado(plan_id, nuevo)

    # POST /viajes/{tripId}/completar | cancelar | reabrir  (estado por viaje)
    def transicionar_viaje(self, trip_id: str, destino: str) -> Plan:
        from domain.planes import estados_viaje
        # Corrección manual: cualquier estado válido (se puede reabrir un viaje
        # completado/cancelado por error). Solo se valida que el destino exista.
        if destino not in estados_viaje.ESTADOS:
            raise estados_viaje.TransicionViajeInvalida("?", destino)
        plan = self._planes.actualizar_estado_viaje(trip_id, destino)
        if plan is None:
            raise PlanNoEncontrado(trip_id)
        return plan
