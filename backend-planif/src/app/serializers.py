"""Serialización dominio → dict para las respuestas del contrato §4.

Vive en `app` (no en el dominio) porque es una preocupación de la capa de
aplicación: el dominio no sabe cómo se ve el JSON de la API.
"""

from __future__ import annotations

from domain.models import Pedido, Plan, Vehiculo, Viaje


def pedido_to_dict(pedido: Pedido) -> dict:
    return {
        "id": pedido.id,
        "order_number": pedido.order_number,
        "customer_id": pedido.customer_id,
        "customer_name": pedido.customer_name,
        "delivery_zone": pedido.delivery_zone,
        "delivery_city": pedido.delivery_city,
        "delivery_latitude": pedido.delivery_latitude,
        "delivery_longitude": pedido.delivery_longitude,
        "total_weight": pedido.total_weight,
        "total_volume": pedido.total_volume,
        "capacity_known": pedido.total_weight is not None and pedido.total_volume is not None,
        "priority": pedido.priority,
    }


def _stop_to_dict(parada, pedidos: dict[str, Pedido]) -> dict:
    """Parada + datos del pedido para el mapa y las etiquetas. Prefiere el
    snapshot congelado en la parada; si está vacío (filas viejas), cae al join
    vivo con el pedido cargado."""
    p = pedidos.get(parada.order_id)

    def campo(snap, vivo):
        return snap if snap is not None else vivo

    return {
        "order_id": parada.order_id,
        "stop_order": parada.stop_order,
        "order_number": campo(parada.order_number, p.order_number if p else None),
        "customer_name": campo(parada.customer_name, p.customer_name if p else None),
        "delivery_city": campo(parada.delivery_city, p.delivery_city if p else None),
        "delivery_zone": campo(parada.delivery_zone, p.delivery_zone if p else None),
        "delivery_latitude": campo(parada.delivery_latitude, p.delivery_latitude if p else None),
        "delivery_longitude": campo(parada.delivery_longitude, p.delivery_longitude if p else None),
        "total_weight": campo(parada.total_weight, p.total_weight if p else None),
        "total_volume": campo(parada.total_volume, p.total_volume if p else None),
    }


def _viaje_to_dict(viaje: Viaje, vehiculos: dict[str, Vehiculo], pedidos: dict[str, Pedido]) -> dict:
    v = vehiculos.get(viaje.vehicle_id)
    return {
        "id": viaje.id,
        "status": viaje.status,
        "vehicle_id": viaje.vehicle_id,
        "driver_id": viaje.driver_id,
        "delivery_zone": viaje.delivery_zone,
        "sequence_order": viaje.sequence_order,
        "total_weight": viaje.total_weight,
        "total_volume": viaje.total_volume,
        # Viaje no rentable (baja ocupación o parada única): el frontend lo
        # muestra para que el planificador/cliente lo apruebe (§B3).
        "requiere_aprobacion": viaje.requiere_aprobacion,
        # Datos del vehículo para las barras de capacidad (max) y el rótulo.
        # Prefiere el snapshot congelado en el viaje; cae al vehículo vivo.
        "vehicle_plate": viaje.vehicle_plate if viaje.vehicle_plate is not None else (v.label if v else None),
        "vehicle_label": viaje.vehicle_plate if viaje.vehicle_plate is not None else (v.label if v else None),
        "vehicle_capacity_weight": viaje.vehicle_capacity_weight if viaje.vehicle_capacity_weight is not None else (v.capacity_weight if v else None),
        "vehicle_capacity_volume": viaje.vehicle_capacity_volume if viaje.vehicle_capacity_volume is not None else (v.capacity_volume if v else None),
        "is_flota_propia": viaje.is_owned if viaje.is_owned is not None else (v.is_owned if v else False),
        "stops": [_stop_to_dict(p, pedidos) for p in viaje.paradas],
    }


def plan_to_dict(
    plan: Plan,
    vehiculos: dict[str, Vehiculo] | None = None,
    pedidos: dict[str, Pedido] | None = None,
) -> dict:
    vehiculos = vehiculos or {}
    pedidos = pedidos or {}
    return {
        "id": plan.id,
        "plan_date": plan.plan_date,
        "warehouse_id": plan.warehouse_id,
        "country_id": plan.country_id,
        "organization_id": plan.organization_id,
        "customer_id": plan.customer_id,
        "status": plan.status,
        "notes": plan.notes,
        "trips": [_viaje_to_dict(v, vehiculos, pedidos) for v in plan.viajes],
        "unassigned_order_numbers": list(plan.sin_asignar),
    }
