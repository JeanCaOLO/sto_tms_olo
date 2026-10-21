"""Lectura de planes persistidos → shape RoutePlan del frontend (planes-types).

Ensambla route_plans + plan_trips + plan_stops (enriquecidos con orders) en la
forma anidada que consume el calendario y la pestaña Planificaciones.
"""

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from tms_common import pg

_PLANS = """
SELECT id, country_id, warehouse_id, plan_date, status, notes, created_at, updated_at
FROM route_plans
WHERE organization_id = %s AND (%s::uuid IS NULL OR warehouse_id = %s::uuid)
  AND (%s::uuid IS NULL OR customer_id = %s::uuid)
ORDER BY plan_date DESC
"""

_TRIPS = """
SELECT t.id, t.plan_id, t.status, t.vehicle_id, t.driver_id, t.delivery_zone, t.sequence_order,
       t.total_weight, t.total_volume, t.vehicle_plate, v.brand AS vehicle_label,
       t.vehicle_capacity_weight, t.vehicle_capacity_volume, t.is_owned
FROM plan_trips t
LEFT JOIN vehicles v ON v.id = t.vehicle_id
WHERE t.plan_id = ANY(%s)
ORDER BY t.sequence_order
"""

_STOPS = """
SELECT s.id, s.trip_id, s.order_id, s.stop_order, s.order_number, s.customer_name,
       s.delivery_city, s.delivery_zone, s.latitude, s.longitude, s.weight, s.volume,
       s.es_cliente_retira, o.delivery_address, o.priority, o.eflow_id_compania, o.observaciones
FROM plan_stops s
LEFT JOIN orders o ON o.id = s.order_id
WHERE s.trip_id = ANY(%s)
ORDER BY s.stop_order
"""


def _val(v):
    if isinstance(v, Decimal):
        return float(v)
    if isinstance(v, (date, datetime)):
        return v.isoformat()
    if isinstance(v, UUID):
        return str(v)
    return v


def _stop(r: dict) -> dict:
    return {
        "id": _val(r["id"]), "order_id": _val(r["order_id"]), "stop_order": r["stop_order"],
        "order_number": r["order_number"], "customer_name": r["customer_name"],
        "delivery_address": r["delivery_address"], "delivery_city": r["delivery_city"],
        "delivery_zone": r["delivery_zone"],
        "delivery_latitude": _val(r["latitude"]), "delivery_longitude": _val(r["longitude"]),
        "total_weight": _val(r["weight"]), "total_volume": _val(r["volume"]),
        "prioridad": r["priority"], "compania": r["eflow_id_compania"],
        "es_cliente_retira": bool(r["es_cliente_retira"]), "observaciones": r["observaciones"],
    }


def _trip(r: dict, stops: list[dict]) -> dict:
    return {
        "id": _val(r["id"]), "status": r["status"], "vehicle_id": _val(r["vehicle_id"]),
        "driver_id": _val(r["driver_id"]), "delivery_zone": r["delivery_zone"],
        "sequence_order": r["sequence_order"],
        "total_weight": _val(r["total_weight"]), "total_volume": _val(r["total_volume"]),
        "vehicle_plate": r["vehicle_plate"], "vehicle_label": r["vehicle_label"] or r["vehicle_plate"],
        "vehicle_capacity_weight": _val(r["vehicle_capacity_weight"]),
        "vehicle_capacity_volume": _val(r["vehicle_capacity_volume"]),
        "is_flota_propia": bool(r["is_owned"]), "numero_viaje": str(r["sequence_order"]), "stops": stops,
    }


def _plan(r: dict, trips: list[dict]) -> dict:
    return {
        "id": _val(r["id"]), "country_id": _val(r["country_id"]), "warehouse_id": _val(r["warehouse_id"]),
        "plan_date": _val(r["plan_date"]), "status": r["status"], "notes": r["notes"],
        "created_at": _val(r["created_at"]), "updated_at": _val(r["updated_at"]),
        "trips": trips, "unassigned_order_numbers": [],
    }


def _ensamblar(planes: list[dict]) -> list[dict]:
    if not planes:
        return []
    plan_ids = [p["id"] for p in planes]
    trips = pg.query(_TRIPS, [plan_ids])
    stops = pg.query(_STOPS, [[t["id"] for t in trips]]) if trips else []
    stops_por_trip: dict = {}
    for s in stops:
        stops_por_trip.setdefault(s["trip_id"], []).append(_stop(s))
    trips_por_plan: dict = {}
    for t in trips:
        trips_por_plan.setdefault(t["plan_id"], []).append(_trip(t, stops_por_trip.get(t["id"], [])))
    return [_plan(p, trips_por_plan.get(p["id"], [])) for p in planes]


def listar(org: str, warehouse: str | None, customer: str | None = None) -> list[dict]:
    return _ensamblar(pg.query(_PLANS, [org, warehouse, warehouse, customer, customer]))


def obtener(org: str, plan_id: str) -> dict | None:
    planes = pg.query(
        "SELECT id, country_id, warehouse_id, plan_date, status, notes, created_at, updated_at "
        "FROM route_plans WHERE organization_id = %s AND id = %s::uuid", [org, plan_id])
    ensamblados = _ensamblar(planes)
    return ensamblados[0] if ensamblados else None
