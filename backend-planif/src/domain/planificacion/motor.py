"""Motor de planificación (§3): compone las tres reglas puras en un `Plan` draft.

    pedidos + flota  ─▶  agrupar_por_zona  ─▶  ajustar_capacidad (por zona)
                                              ─▶  optimizar_secuencia (por viaje)
                                              ─▶  Plan(draft, viajes, stops)

Sin I/O: recibe dataclasses del dominio y devuelve un `Plan`. La persistencia y
la lectura de Aurora las hace el caso de uso en `app/` vía los ports.
"""

from __future__ import annotations

from dataclasses import replace

from domain.models import Parada, Pedido, Plan, Vehiculo, Viaje
from domain.planificacion.agrupar_por_zona import agrupar_por_zona
from domain.planificacion.ajustar_capacidad import (
    VOLUME_SAFETY_MARGIN,
    WEIGHT_SAFETY_MARGIN,
    Bin,
    ajustar_capacidad,
)
from domain.planificacion.optimizar_secuencia import optimizar_secuencia
from domain.planificacion.rentabilidad import requiere_aprobacion


def _viaje_desde_bin(bin_: Bin, zona: str, sequence_order: int) -> Viaje:
    secuencia = optimizar_secuencia(bin_.pedidos)
    paradas = tuple(Parada(order_id=p.id, stop_order=i + 1) for i, p in enumerate(secuencia))
    return Viaje(
        vehicle_id=bin_.vehiculo.id,
        delivery_zone=zona or None,
        sequence_order=sequence_order,
        paradas=paradas,
        total_weight=round(bin_.peso, 3),
        total_volume=round(bin_.volumen, 3),
        driver_id=bin_.vehiculo.driver_id,
        requiere_aprobacion=requiere_aprobacion(
            total_weight=bin_.peso,
            total_volume=bin_.volumen,
            vehiculo=bin_.vehiculo,
            num_paradas=len(paradas),
        ),
    )


def generar_plan(
    plan_date: str,
    pedidos: list[Pedido],
    vehiculos: list[Vehiculo],
    warehouse_id: str | None = None,
    country_id: str | None = None,
    organization_id: str | None = None,
    customer_id: str | None = None,
    created_by: str | None = None,
) -> Plan:
    """Corre el motor completo y devuelve un `Plan` en estado `draft`.

    Un viaje por (zona, camión) con paradas ya en secuencia optimizada. Los
    pedidos que no caben por capacidad se listan en `plan.sin_asignar`.

    Rotación de vehículos (C4): cada viaje usa un camión DISTINTO mientras haya
    flota libre. Se lleva un pool de vehículos disponibles y, tras asignar una
    zona, se sacan del pool los que quedaron usados (flota propia primero, porque
    `ajustar_capacidad` ya ordena `is_owned` al frente). Techo (ponytail): si hay
    más zonas/viajes que camiones, el pool se agota y se reinicia con la flota
    completa — a partir de ahí se REUTILIZAN placas (no se rompe el plan). En ese
    caso la operación necesita más flota; el motor no la inventa.
    """
    viajes: list[Viaje] = []
    sin_asignar: list[str] = []
    sequence_order = 1
    disponibles = list(vehiculos)
    for zona, pedidos_zona in agrupar_por_zona(pedidos).items():
        # Si el pool se agotó (más zonas que camiones), reinicia con la flota
        # completa: se reutilizan vehículos. Techo documentado, no un error.
        pool = disponibles if disponibles else list(vehiculos)
        asignacion = ajustar_capacidad(pedidos_zona, pool)
        usados = {b.vehiculo.id for b in asignacion.bins}
        for bin_ in asignacion.bins:
            viajes.append(_viaje_desde_bin(bin_, zona, sequence_order))
            sequence_order += 1
        # Saca del pool los vehículos que ya cargaron esta zona para que la
        # siguiente tome placas distintas mientras quede flota libre.
        disponibles = [v for v in pool if v.id not in usados]
        sin_asignar.extend(p.id for p in asignacion.sin_asignar)

    return Plan(
        plan_date=plan_date,
        warehouse_id=warehouse_id,
        country_id=country_id,
        organization_id=organization_id,
        customer_id=customer_id,
        status="draft",
        viajes=tuple(viajes),
        created_by=created_by,
        sin_asignar=tuple(sin_asignar),
    )



def _excede_capacidad(pedidos: list[Pedido], vehiculo: Vehiculo) -> bool:
    peso = sum(p.total_weight or 0.0 for p in pedidos)
    volumen = sum(p.total_volume or 0.0 for p in pedidos)
    return (
        peso > vehiculo.capacity_weight * WEIGHT_SAFETY_MARGIN
        or volumen > vehiculo.capacity_volume * VOLUME_SAFETY_MARGIN
    )


class CapacidadExcedida(Exception):
    """La edición (PUT) pone en un viaje más carga de la que admite el camión."""

    def __init__(self, vehicle_id: str):
        super().__init__(f"El viaje del vehículo {vehicle_id} excede la capacidad con márgenes.")
        self.vehicle_id = vehicle_id


def generar_plan_desde_asignaciones(
    plan_date: str,
    asignaciones: list[dict],
    pedidos_por_id: dict[str, Pedido],
    vehiculos: dict[str, Vehiculo],
    base: Plan,
) -> Plan:
    """Reconstruye los viajes de un plan a partir de asignaciones explícitas del
    editor (§4 PUT): `[{vehicle_id, driver_id?, delivery_zone?, order_ids:[...]}]`.

    El server REVALIDA capacidad (lanza `CapacidadExcedida` si un viaje se pasa)
    y RECALCULA la secuencia de cada viaje con el mismo 2-opt del motor. No
    reasigna por su cuenta: respeta la decisión del planificador.
    """
    viajes: list[Viaje] = []
    asignados: set[str] = set()
    for sequence_order, asignacion in enumerate(asignaciones, start=1):
        vehicle_id = asignacion["vehicle_id"]
        vehiculo = vehiculos.get(vehicle_id)
        pedidos = [pedidos_por_id[oid] for oid in asignacion.get("order_ids", []) if oid in pedidos_por_id]
        asignados.update(p.id for p in pedidos)
        if vehiculo is not None and _excede_capacidad(pedidos, vehiculo):
            raise CapacidadExcedida(vehicle_id)
        secuencia = optimizar_secuencia(pedidos)
        paradas = tuple(Parada(order_id=p.id, stop_order=i + 1) for i, p in enumerate(secuencia))
        peso_viaje = round(sum(p.total_weight or 0.0 for p in pedidos), 3)
        volumen_viaje = round(sum(p.total_volume or 0.0 for p in pedidos), 3)
        viajes.append(
            Viaje(
                vehicle_id=vehicle_id,
                delivery_zone=asignacion.get("delivery_zone"),
                sequence_order=sequence_order,
                paradas=paradas,
                total_weight=peso_viaje,
                total_volume=volumen_viaje,
                driver_id=asignacion.get("driver_id"),
                requiere_aprobacion=requiere_aprobacion(
                    total_weight=peso_viaje,
                    total_volume=volumen_viaje,
                    vehiculo=vehiculo,
                    num_paradas=len(paradas),
                ),
            )
        )
    sin_asignar = tuple(oid for oid in pedidos_por_id if oid not in asignados)
    return replace(base, plan_date=plan_date, status=base.status, viajes=tuple(viajes), sin_asignar=sin_asignar)
