"""Entidades del dominio de planificación (inmutables, sin I/O).

Espejo mínimo del modelo de datos del contrato §1 (`route_plans`, `plan_trips`,
`plan_stops`) más las entradas del motor (`Pedido`, `Vehiculo`). El peso/volumen
puede ser desconocido (`None`): el motor NO lo trata como 0 para no asignar
camiones con datos inventados (misma decisión que `capacity_known` en main).
"""

from __future__ import annotations

from dataclasses import dataclass, field, replace


@dataclass(frozen=True)
class Pedido:
    """Un pedido planificable (orders + order_items agregados)."""

    id: str
    order_number: str | None = None
    customer_id: str | None = None
    customer_name: str | None = None
    delivery_address: str | None = None
    delivery_zone: str | None = None
    delivery_city: str | None = None
    delivery_latitude: float | None = None
    delivery_longitude: float | None = None
    total_weight: float | None = None
    total_volume: float | None = None
    priority: int | None = None

    @property
    def has_coords(self) -> bool:
        return self.delivery_latitude is not None and self.delivery_longitude is not None


@dataclass(frozen=True)
class Vehiculo:
    """Un vehículo de la flota, con su capacidad y si es propio."""

    id: str
    capacity_weight: float
    capacity_volume: float
    is_owned: bool = True
    driver_id: str | None = None
    label: str | None = None


@dataclass(frozen=True)
class Parada:
    """Una parada dentro de un viaje: un pedido en una posición de la secuencia.

    Los campos de snapshot congelan el dato del pedido al momento de guardar el
    plan (un plan es un registro inmutable de lo despachado). Son opcionales:
    filas viejas quedan en None y el serializer cae al join vivo.
    """

    order_id: str
    stop_order: int
    order_number: str | None = None
    customer_name: str | None = None
    delivery_address: str | None = None
    delivery_city: str | None = None
    delivery_zone: str | None = None
    delivery_latitude: float | None = None
    delivery_longitude: float | None = None
    total_weight: float | None = None
    total_volume: float | None = None


@dataclass(frozen=True)
class Viaje:
    """Un viaje = un camión que cubre una zona, con sus paradas en secuencia."""

    vehicle_id: str
    delivery_zone: str | None
    sequence_order: int
    paradas: tuple[Parada, ...] = field(default_factory=tuple)
    total_weight: float = 0.0
    total_volume: float = 0.0
    driver_id: str | None = None
    # Viaje "no rentable" (baja ocupación o parada única): el motor lo marca para
    # que el planificador/cliente lo apruebe. NO bloquea la creación del plan.
    requiere_aprobacion: bool = False
    # Identidad y ciclo de vida del viaje (plan_trips). El estado del viaje es
    # independiente del plan: pending → completed | cancelled.
    id: str | None = None
    status: str = "pending"
    # Snapshot del vehículo (congelado al guardar; None en filas viejas).
    vehicle_plate: str | None = None
    vehicle_capacity_weight: float | None = None
    vehicle_capacity_volume: float | None = None
    is_owned: bool | None = None


@dataclass(frozen=True)
class Plan:
    """Cabecera de una planificación (route_plan) con sus viajes."""

    plan_date: str
    warehouse_id: str | None = None
    country_id: str | None = None
    organization_id: str | None = None
    customer_id: str | None = None  # compañía dueña del plan (un plan = una compañía)
    status: str = "draft"
    viajes: tuple[Viaje, ...] = field(default_factory=tuple)
    id: str | None = None
    created_by: str | None = None
    notes: str | None = None
    # Pedidos que no cupieron en ningún viaje por capacidad (se reportan, no se pierden).
    sin_asignar: tuple[str, ...] = field(default_factory=tuple)

    def with_status(self, status: str) -> "Plan":
        return replace(self, status=status)
