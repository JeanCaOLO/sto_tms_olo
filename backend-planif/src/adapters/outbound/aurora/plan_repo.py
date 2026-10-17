"""Adaptador Aurora del port PlanRepo (route_plans + plan_trips + plan_stops).

Escrituras atómicas vía `pg.transaction()`. Si el schema de WT-1 no está
aplicado, cae a un almacén en memoria por contenedor (`_MockStore`) para que el
flujo del contrato §4 funcione end-to-end contra mocks. El mock NO persiste
entre cold starts; es solo para desarrollo/pruebas sin BD.
"""

from __future__ import annotations

import uuid
from dataclasses import replace

from domain.models import Parada, Plan, Viaje
from adapters.outbound.aurora.schema_probe import tabla_existe
from adapters.outbound.aurora import sql
from lib.tms_common import pg


def _parada_from_row(s: dict) -> Parada:
    return Parada(
        order_id=str(s["order_id"]),
        stop_order=s["stop_order"],
        order_number=s.get("order_number"),
        customer_name=s.get("customer_name"),
        delivery_city=s.get("delivery_city"),
        delivery_zone=s.get("delivery_zone"),
        delivery_latitude=s.get("latitude"),
        delivery_longitude=s.get("longitude"),
        total_weight=s.get("weight"),
        total_volume=s.get("volume"),
    )


def _viaje_from_rows(trip: dict, stops: list[dict]) -> Viaje:
    paradas = tuple(_parada_from_row(s) for s in stops)
    return Viaje(
        vehicle_id=str(trip["vehicle_id"]),
        delivery_zone=trip.get("delivery_zone"),
        sequence_order=trip["sequence_order"],
        paradas=paradas,
        total_weight=trip.get("total_weight") or 0.0,
        total_volume=trip.get("total_volume") or 0.0,
        driver_id=(str(trip["driver_id"]) if trip.get("driver_id") else None),
        id=str(trip["id"]),
        status=trip.get("status") or "pending",
        vehicle_plate=trip.get("vehicle_plate"),
        vehicle_capacity_weight=trip.get("vehicle_capacity_weight"),
        vehicle_capacity_volume=trip.get("vehicle_capacity_volume"),
        is_owned=trip.get("is_owned"),
    )


def _plan_from_row(row: dict, viajes: tuple[Viaje, ...]) -> Plan:
    return Plan(
        id=str(row["id"]),
        plan_date=str(row["plan_date"]),
        warehouse_id=(str(row["warehouse_id"]) if row.get("warehouse_id") else None),
        country_id=(str(row["country_id"]) if row.get("country_id") else None),
        organization_id=(str(row["organization_id"]) if row.get("organization_id") else None),
        customer_id=(str(row["customer_id"]) if row.get("customer_id") else None),
        status=row["status"],
        created_by=(str(row["created_by"]) if row.get("created_by") else None),
        notes=row.get("notes"),
        viajes=viajes,
    )


class _MockStore:
    """Almacén en memoria (fallback sin schema). Un dict id → Plan por contenedor."""

    def __init__(self) -> None:
        self._planes: dict[str, Plan] = {}

    def guardar(self, plan: Plan) -> Plan:
        plan_id = str(uuid.uuid4())
        stored = replace(plan, id=plan_id)
        self._planes[plan_id] = stored
        return stored

    def obtener(self, plan_id: str) -> Plan | None:
        return self._planes.get(plan_id)

    def listar(self, organization_id, warehouse_id, status=None, plan_date=None, customer_id=None) -> list[Plan]:
        return [
            p for p in self._planes.values()
            if (status is None or p.status == status)
            and (plan_date is None or p.plan_date == plan_date)
            and (customer_id is None or p.customer_id == customer_id)
        ]

    def reemplazar_viajes(self, plan_id: str, plan: Plan) -> Plan:
        stored = replace(plan, id=plan_id)
        self._planes[plan_id] = stored
        return stored

    def actualizar_estado(self, plan_id: str, status: str) -> Plan:
        self._planes[plan_id] = self._planes[plan_id].with_status(status)
        return self._planes[plan_id]


_mock_store = _MockStore()


class AuroraPlanRepo:
    """Implementa `ports.PlanRepo` contra route_plans/plan_trips/plan_stops."""

    def _usa_mock(self) -> bool:
        return not tabla_existe("route_plans")

    def guardar(self, plan: Plan) -> Plan:
        if self._usa_mock():
            return _mock_store.guardar(plan)
        with pg.transaction() as run:
            plan_id = run(
                sql.INSERT_PLAN_SQL,
                [plan.organization_id, plan.country_id, plan.warehouse_id, plan.customer_id,
                 plan.plan_date, plan.status, plan.created_by, plan.notes],
            )[0]["id"]
            self._insert_viajes(run, plan_id, plan.viajes)
        return self.obtener(str(plan_id)) or replace(plan, id=str(plan_id))

    def _insert_viajes(self, run, plan_id, viajes: tuple[Viaje, ...]) -> None:
        for viaje in viajes:
            trip_id = run(
                sql.INSERT_TRIP_SQL,
                [plan_id, viaje.vehicle_id, viaje.driver_id, viaje.delivery_zone,
                 viaje.sequence_order, viaje.total_weight, viaje.total_volume,
                 viaje.vehicle_plate, viaje.vehicle_capacity_weight,
                 viaje.vehicle_capacity_volume, viaje.is_owned],
            )[0]["id"]
            for parada in viaje.paradas:
                run(sql.INSERT_STOP_SQL,
                    [trip_id, parada.order_id, parada.stop_order,
                     parada.order_number, parada.customer_name, parada.delivery_city,
                     parada.delivery_zone, parada.delivery_latitude, parada.delivery_longitude,
                     parada.total_weight, parada.total_volume])

    def _hidratar_viajes(self, plan_id: str) -> tuple[Viaje, ...]:
        trips = pg.query(sql.SELECT_TRIPS_SQL, [plan_id])
        return tuple(
            _viaje_from_rows(trip, pg.query(sql.SELECT_STOPS_SQL, [trip["id"]]))
            for trip in trips
        )

    def obtener(self, plan_id: str) -> Plan | None:
        if self._usa_mock():
            return _mock_store.obtener(plan_id)
        rows = pg.query(sql.SELECT_PLAN_SQL, [plan_id])
        if not rows:
            return None
        return _plan_from_row(rows[0], self._hidratar_viajes(plan_id))

    def listar(self, organization_id, warehouse_id, status=None, plan_date=None, customer_id=None) -> list[Plan]:
        if self._usa_mock():
            return _mock_store.listar(organization_id, warehouse_id, status, plan_date, customer_id)
        rows = pg.query(
            sql.LIST_PLANS_SQL,
            [organization_id, warehouse_id, warehouse_id,
             status, status, plan_date, plan_date, customer_id, customer_id],
        )
        # Hidratar viajes+paradas de cada plan (para que la pestaña muestre las
        # rutas y sus mapas, no solo la cabecera).
        return [_plan_from_row(r, self._hidratar_viajes(str(r["id"]))) for r in rows]

    def reemplazar_viajes(self, plan_id: str, plan: Plan) -> Plan:
        if self._usa_mock():
            return _mock_store.reemplazar_viajes(plan_id, plan)
        with pg.transaction() as run:
            run(sql.DELETE_TRIPS_SQL, [plan_id])  # plan_stops cae por ON DELETE CASCADE
            self._insert_viajes(run, plan_id, plan.viajes)
        return self.obtener(plan_id) or plan

    def actualizar_estado(self, plan_id: str, status: str) -> Plan:
        if self._usa_mock():
            return _mock_store.actualizar_estado(plan_id, status)
        pg.query(sql.UPDATE_STATUS_SQL, [status, plan_id])
        plan = self.obtener(plan_id)
        if plan is None:
            raise ValueError(f"Plan no encontrado tras actualizar estado: {plan_id}")
        return plan

    def actualizar_estado_viaje(self, trip_id: str, status: str) -> Plan | None:
        """Transiciona un viaje (solo desde pending, guard en el SQL) y devuelve
        el plan que lo contiene, o None si el viaje no existe / no estaba pending."""
        if self._usa_mock():
            return None
        rows = pg.query(sql.UPDATE_TRIP_STATUS_SQL, [status, trip_id])
        if not rows:
            return None
        return self.obtener(str(rows[0]["plan_id"]))
