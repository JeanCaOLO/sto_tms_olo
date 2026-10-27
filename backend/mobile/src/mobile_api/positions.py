"""POST /posiciones: lote de posiciones GPS (idempotente por client_id). Solo viajes propios y en tránsito.

Mismo contrato que el ingest de la web (`TMS AHORA SI/backend/tracking/src/app.py`): un punto no usable (mock o
precisión > 200 m) se guarda pero no mueve la última posición; solo un punto nuevo y de viaje activo la mueve; la
primera salida de la sede (> 300 m) fija `routes.departed_at` una sola vez. Todo el lote va en UNA transacción.
"""

from datetime import datetime, timezone

from . import db, logic, presence, sql
from .auth import Driver
from .errors import HttpError
from .http import body_dict, ok


def now() -> datetime:
    return datetime.now(timezone.utc)


def ingest_positions(event: dict, driver: Driver) -> dict:
    body = body_dict(event)
    positions = body.get("positions")
    if not isinstance(positions, list) or not positions:
        raise HttpError(400, "positions debe ser una lista no vacía")
    if len(positions) > logic.MAX_BATCH:
        raise HttpError(400, f"Máximo {logic.MAX_BATCH} posiciones por lote")
    at, rejected, valid = now(), [], []
    for raw in positions:
        try:
            valid.append(logic.validate_position(raw, at))
        except ValueError as err:
            rejected.append({"client_id": raw.get("client_id") if isinstance(raw, dict) else None, "reason": str(err)})
    if not valid:
        return ok({"accepted": 0, "duplicates": 0, "rejected": rejected})
    # Solo se consultan viajes DEL conductor: uno ajeno es "no encontrado" y no se escribe nada.
    routes = {str(r["id"]): r for r in db.query(
        sql.ROUTES_FOR_POSITIONS_SQL, [driver.organization_id, driver.driver_id,
                                       sorted({p["route_id"] for p in valid})])}
    accepted = []
    for pos in valid:
        route = routes.get(pos["route_id"])
        if route is None:
            rejected.append({"client_id": pos["client_id"], "reason": "viaje no encontrado"})
        elif not logic.route_accepts(logic.route_state(route["status"]), route.get("actual_end_time"), at):
            rejected.append({"client_id": pos["client_id"], "reason": "viaje no activo"})
        else:
            accepted.append((pos, route))
    if not accepted:
        return ok({"accepted": 0, "duplicates": 0, "rejected": rejected})
    device_id = body.get("device_id") if isinstance(body.get("device_id"), str) else None

    def write(run) -> int:
        values, params = [], []
        for pos, route in accepted:
            values.append(sql.POSITION_PLACEHOLDERS)
            params += [driver.organization_id, pos["route_id"], route["vehicle_id"], route["driver_id"], device_id,
                       pos["client_id"], pos["latitude"], pos["longitude"], pos["accuracy_m"], pos["speed_mps"],
                       pos["heading_deg"], pos["battery_pct"], pos["is_mock"], pos["recorded_at"]]
        stored = {str(r["client_id"]) for r in run(
            f"INSERT INTO tracking_positions ({sql.POSITION_COLUMNS}) VALUES {', '.join(values)} "
            "ON CONFLICT (client_id) DO NOTHING RETURNING client_id", params)}
        fresh = [(pos, route) for pos, route in accepted if pos["client_id"] in stored]

        # Solo un punto nuevo, usable y de viaje ACTIVO mueve la última posición (la gracia posterior al cierre no).
        newest: dict[str, dict] = {}
        for pos, route in fresh:
            if not logic.positions_usable(pos["is_mock"], pos["accuracy_m"]) or logic.route_state(route["status"]) != "active":
                continue
            best = newest.get(pos["route_id"])
            if best is None or pos["recorded_at"] > best["recorded_at"]:
                newest[pos["route_id"]] = pos
        if newest:
            last_params = []
            for route_id, pos in newest.items():
                last_params += [route_id, driver.organization_id, pos["latitude"], pos["longitude"], pos["speed_mps"],
                                pos["heading_deg"], pos["battery_pct"], pos["recorded_at"]]
            run(sql.UPSERT_LAST_POSITIONS_SQL.format(values=", ".join([sql.LAST_POSITION_ROW] * len(newest))),
                last_params)

        # Primera salida de la sede (> 300 m): se fija una sola vez, con la primera posición usable que la muestra.
        by_route: dict[str, list] = {}
        for pos, route in fresh:
            if route.get("departed_at") is None and logic.positions_usable(pos["is_mock"], pos["accuracy_m"]):
                by_route.setdefault(pos["route_id"], []).append(pos)
        for route_id, points in by_route.items():
            route = routes[route_id]
            points.sort(key=lambda p: p["recorded_at"])
            origin = logic.origin_coords(route.get("country"), route.get("customer_code"),
                                         route.get("origin_lat"), route.get("origin_lng"))
            departed = logic.first_departure(points, origin)
            if departed is not None:
                run(sql.SET_DEPARTED_SQL, [departed, route_id])
        return len(stored)

    inserted = db.run_in_transaction(write)
    newest_battery = max(accepted, key=lambda item: item[0]["recorded_at"])[0]["battery_pct"]
    presence.touch(driver, at, device_id, newest_battery)
    return ok({"accepted": inserted, "duplicates": len(accepted) - inserted, "rejected": rejected})
