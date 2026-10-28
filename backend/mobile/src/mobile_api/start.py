"""POST /viajes/{id}/iniciar: el chofer inicia SU viaje planificado (crea routes + dispatch_guides + evento).

Mismo resultado que el "iniciar" de la web (`TMS AHORA SI/backend/tracking/src/app.py::start_viaje`) para que la web
lo vea igual: ruta `En tránsito`, guías en orden de parada y horas planificadas medidas desde ahora. Idempotente: si
la ruta ya existe devuelve la misma (200), sea quien sea que la inició.
"""

from datetime import datetime, timezone

from . import db, logic, sql
from .auth import Driver
from .errors import HttpError
from .http import ok, path_param

UNIQUE_VIOLATION = "23505"


def now() -> datetime:
    return datetime.now(timezone.utc)


def _float(value) -> float | None:
    return None if value is None else float(value)


def start_trip(event: dict, driver: Driver) -> dict:
    trip_id = path_param(event, "id")
    if not logic.is_uuid(trip_id):
        raise HttpError(404, "Viaje planificado no encontrado")

    def work(run):
        rows = run(sql.PLAN_TRIP_SQL, [trip_id])
        # Un viaje de otro conductor o de otra organización es "no encontrado" (no se revela que existe).
        if (not rows or str(rows[0]["organization_id"]) != driver.organization_id
                or str(rows[0]["driver_id"] or "") != driver.driver_id):
            raise HttpError(404, "Viaje planificado no encontrado")
        trip = rows[0]
        existing = run(sql.ROUTE_BY_PLAN_TRIP_SQL, [trip_id])
        if existing:
            return {"route_id": str(existing[0]["id"]), "created": False}
        # Un viaje a la vez: hasta entregar todo el actual no se inicia otro (la app tampoco muestra los siguientes).
        if run(sql.UNFINISHED_ROUTE_SQL, [driver.organization_id, driver.driver_id, logic.ACTIVE_STATUS_SQL_VALUES]):
            raise HttpError(409, "Termina las entregas de tu viaje actual antes de iniciar otro.",
                            code="trip_in_progress")
        if trip["plan_status"] != "confirmed":
            raise HttpError(409, "El plan debe estar confirmado para iniciar el viaje.")
        if trip["status"] != "pending":
            raise HttpError(409, "El viaje planificado ya no está pendiente.")
        stops = run(sql.PLAN_STOPS_SQL, [trip_id])
        if not stops:
            raise HttpError(409, "El viaje planificado no tiene paradas.")
        stores = run(sql.ORIGIN_STORE_SQL, [driver.organization_id, trip["country_id"]])
        if not stores:
            raise HttpError(409, "No hay una tienda de origen configurada para el país del plan.")
        zone = run(sql.ZONE_SQL, [driver.organization_id, trip["delivery_zone"], trip["delivery_zone"]]) \
            if trip["delivery_zone"] else []
        route_number = f"VJ-{trip['plan_date'].strftime('%Y%m%d')}-{str(trip['id'])[:8].upper()}"
        origin = logic.origin_coords(trip.get("country"), trip.get("customer_code"),
                                     stores[0]["latitude"], stores[0]["longitude"])
        plan = logic.plan_schedule(origin, [{"lat": _float(s["lat"]), "lng": _float(s["lng"])} for s in stops], now())
        if origin is None:
            # Sin coordenadas de la sede no hay primer tramo que estimar: sin hora planificada no hay falso retraso.
            plan = {"arrivals": [None] * len(stops), "end": None, "total_km": None}
        capacity = None
        if trip["total_weight"] is not None and trip["vehicle_capacity_weight"]:
            capacity = round(float(trip["total_weight"]) * 100 / float(trip["vehicle_capacity_weight"]), 2)
        route = run(sql.INSERT_ROUTE_SQL, [
            driver.organization_id, stores[0]["id"], trip["driver_id"], trip["vehicle_id"], trip["carrier_id"],
            route_number, trip["plan_date"], len(stops), trip["total_weight"], trip["total_volume"],
            "Iniciado por el chofer desde la app (tracking en vivo).", zone[0]["id"] if zone else None, trip_id,
            plan["end"], plan["total_km"], capacity])
        route_id = route[0]["id"]
        for index, stop in enumerate(stops, start=1):
            run(sql.INSERT_GUIDE_SQL, [driver.organization_id, route_id, stop["order_id"], f"{route_number}-{index}",
                                       index, "Generada al iniciar el viaje desde la app.", plan["arrivals"][index - 1]])
        run(sql.INSERT_EVENT_SQL, [driver.organization_id, route_id, None, "route_started", "info", now(), None, None,
                                   "Viaje iniciado por el chofer", driver.app_user_id, None])
        return {"route_id": str(route_id), "created": True, "route_number": route_number}

    try:
        result = db.run_in_transaction(work)
    except HttpError as err:
        # Dos "iniciar" a la vez para el mismo plan: el índice único ux_routes_plan_trip gana y el otro recupera la ruta.
        if err.code != UNIQUE_VIOLATION:
            raise
        existing = db.query(sql.ROUTE_BY_PLAN_TRIP_SQL, [trip_id])
        if not existing:
            raise
        return ok({"route_id": str(existing[0]["id"]), "created": False}, 200)
    return ok(result, 201 if result["created"] else 200)
