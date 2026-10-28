"""GET /mi-viaje: el viaje actual del chofer autenticado (en tránsito, o el plan confirmado de hoy por iniciar)."""

from datetime import datetime, timezone

from . import db, logic, sql
from .auth import Driver
from .http import ok


def now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(value) -> str | None:
    if value is None:
        return None
    return (value if value.tzinfo else value.replace(tzinfo=timezone.utc)).isoformat()


def _float(value) -> float | None:
    return None if value is None else float(value)


def _coords(lat, lng) -> tuple[float, float] | None:
    return None if lat is None or lng is None else (float(lat), float(lng))


def _progress(total: int, delivered: int, failed: int) -> dict:
    done = delivered + failed
    return {"total": total, "done": done, "delivered": delivered, "failed": failed, "remaining": total - done,
            "percent": round(done * 100 / total) if total else 0}


def _route_item(row: dict, guides: list[dict], at: datetime, driver_name: str | None) -> dict:
    stop_inputs = [{"id": str(g["id"]), "state": logic.guide_state(g["delivery_status"], g["status"]),
                    "sequence": g["sequence_number"], "lat": _float(g["latitude"]), "lng": _float(g["longitude"]),
                    "planned_arrival": g["planned_arrival_time"]} for g in guides]
    position = _coords(row["last_lat"], row["last_lng"])
    live = logic.stop_metrics(position, stop_inputs, at)
    delivered = sum(s["state"] == logic.GUIDE_DELIVERED for s in stop_inputs)
    failed = sum(s["state"] == logic.GUIDE_FAILED for s in stop_inputs)
    total, done = len(stop_inputs), delivered + failed
    origin = logic.origin_coords(row.get("country"), row.get("customer_code"), row["origin_lat"], row["origin_lng"])
    departed = done > 0 or logic.is_departed(position, origin)

    stops = []
    for g, stop in zip(guides, stop_inputs):
        metrics = live["by_stop"].get(stop["id"])
        stops.append({
            "id": stop["id"], "guide_number": g["guide_number"], "sequence": g["sequence_number"],
            "state": stop["state"], "order_number": g["order_number"], "invoice_number": g["invoice_number"],
            "customer_name": g["customer_name"], "customer_phone": g["customer_phone"],
            "address": g["delivery_address"], "city": g["delivery_city"], "items": g["total_items"],
            "weight": _float(g["total_weight"]), "lat": stop["lat"], "lng": stop["lng"],
            "recipient_name": g["recipient_name"], "arrived_at": _iso(g["actual_arrival_time"]),
            "evidence_kinds": list(g["evidence_kinds"] or []),
            "planned_arrival_at": _iso(g["planned_arrival_time"]),
            "distance_m": metrics["distance_m"] if metrics else None,
            "eta_at": _iso(metrics["eta_at"]) if metrics else None,
            "delay_min": metrics["delay_min"] if metrics else None,
        })
    return {
        "kind": "route", "id": str(row["id"]), "route_id": str(row["id"]), "route_number": row["route_number"],
        "state": "active", "phase": "en_ruta" if departed else "por_salir", "plate": row["plate"],
        "zone_name": row["zone_name"], "route_date": row["route_date"].isoformat() if row["route_date"] else None,
        "started_at": _iso(row["actual_start_time"]), "planned_end_at": _iso(row["planned_end_time"]),
        "driver_name": driver_name, "origin": None if origin is None else {"lat": origin[0], "lng": origin[1]},
        "progress": _progress(total, delivered, failed),
        "next_stop_id": live["next_stop_id"], "delay_min": live["delay_min"],
        "position": None if position is None else {"lat": position[0], "lng": position[1],
                                                   "recorded_at": _iso(row["last_position_at"])},
        "stops": stops,
    }


def my_trips(event: dict, driver: Driver) -> dict:
    at = now()
    routes = db.query(sql.MY_ROUTES_SQL, [driver.organization_id, driver.driver_id, logic.ACTIVE_STATUS_SQL_VALUES])
    guides_by_route: dict[str, list[dict]] = {}
    if routes:
        for guide in db.query(sql.GUIDES_BY_ROUTES_SQL, [[str(r["id"]) for r in routes]]):
            guides_by_route.setdefault(str(guide["route_id"]), []).append(guide)
    items = [_route_item(row, guides_by_route.get(str(row["id"]), []), at, driver.full_name) for row in routes]

    planned = db.query(sql.MY_PLANNED_SQL, [driver.organization_id, driver.driver_id])
    stops_by_trip: dict[str, list] = {}
    if planned:
        for st in db.query(sql.MY_PLANNED_STOPS_SQL, [[str(p["plan_trip_id"]) for p in planned]]):
            stops_by_trip.setdefault(str(st["trip_id"]), []).append({
                "id": str(st["order_id"]), "sequence": st["stop_order"], "state": logic.GUIDE_PENDING,
                "order_number": st["order_number"], "invoice_number": st["invoice_number"],
                "customer_name": st["customer_name"], "customer_phone": st["customer_phone"],
                "address": st["delivery_address"], "city": st["delivery_city"], "items": st["total_items"],
                "weight": _float(st["total_weight"]), "lat": _float(st["latitude"]), "lng": _float(st["longitude"])})
    for trip in planned:
        stops = stops_by_trip.get(str(trip["plan_trip_id"]), [])
        items.append({
            "kind": "planned", "id": str(trip["plan_trip_id"]), "route_id": None, "route_number": None,
            "state": "planned", "phase": "por_salir", "plan_date": trip["plan_date"].isoformat(),
            "zone_name": trip["delivery_zone"], "plate": trip["plate"],
            "driver_name": driver.full_name, "origin": None, "progress": _progress(len(stops), 0, 0),
            "stops": stops})
    return ok({"items": _current(items)})


def _current(items: list[dict]) -> list[dict]:
    """El chofer ve UN viaje: el primero del día con paradas por entregar. Los siguientes quedan ocultos hasta
    entregar (o marcar como no entregadas) todas las paradas del actual. Con todo hecho queda a la vista el último
    viaje terminado (su resumen). Orden: viajes ya iniciados por hora de salida y luego los planes por orden."""
    for item in items:
        if item["progress"]["remaining"] > 0:
            return [item]
    return items[-1:]
