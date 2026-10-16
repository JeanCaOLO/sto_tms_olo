"""Tracking en vivo de viajes (/api/v1/tracking/*).

Lectura (web): lista de viajes con progreso y última posición, detalle con paradas, eventos,
evidencias (URLs firmadas de 5 min) y devoluciones, y los viajes planificados listos para iniciar.
Escritura (web / app del chofer): iniciar viaje desde Planificación, completar, ingesta de posiciones
por lotes, transición de parada, novedades y evidencias de entrega (subida directa a S3).

Permisos: módulo `tracking` (view para leer; create para iniciar e ingestar; edit para completar,
transicionar paradas, novedades y evidencias) + país de la tienda de origen de la ruta.

App del chofer (rol `Chofer`): solo opera los viajes donde `routes.driver_id` es el conductor enlazado a su
usuario (`drivers.app_user_id`). Ve `mi-viaje`, el detalle de SUS viajes y escribe posiciones, paradas,
novedades, devoluciones y evidencias; lo demás (lista general, KPIs, iniciar, completar, revisar) es del
administrador y le responde 403. Un viaje ajeno responde 404 (no revela que existe).
"""

import os
import uuid
from datetime import datetime, timedelta, timezone

from tms_common import permissions, pg
from tms_common.errors import HttpError
from tms_common.event import json_body, path_param, query_params
from tms_common.handler import tms_handler
from tms_common.responses import json_response

import tracking_logic as logic
import tracking_sql as sql

MODULE = "tracking"
DEFAULT_LIMIT, MAX_LIMIT = 30, 100

_s3 = None


def s3():
    global _s3
    if _s3 is None:
        import boto3  # perezoso: las rutas sin S3 (y el servidor local) no lo necesitan
        from botocore.config import Config
        region = os.environ.get("AWS_REGION", "us-east-2")
        _s3 = boto3.client("s3", region_name=region, endpoint_url=f"https://s3.{region}.amazonaws.com",
                           config=Config(signature_version="s3v4", s3={"addressing_style": "virtual"}))
    return _s3


def bucket() -> str:
    return os.environ["TRACKING_BUCKET"]


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _ok(data: object, status: int = 200) -> dict:
    return json_response(status, {"data": data, "error": None})


def _caller(event: dict, action: str, *, driver_ok: bool = False):
    caller = permissions.for_event(event)
    caller.require(MODULE, action)
    if caller.role_name == logic.DRIVER_ROLE and not driver_ok:
        raise HttpError(403, "Esta acción es del administrador.")
    rows = pg.query(sql.ORG_SQL, [caller.app_user_id])
    if not rows or rows[0]["organization_id"] is None:
        raise HttpError(403, "Tu usuario no pertenece a una organización.")
    return caller, str(rows[0]["organization_id"])


def _my_driver(caller) -> str | None:
    """Conductor enlazado al usuario (drivers.app_user_id); None si no hay."""
    rows = pg.query(sql.DRIVER_BY_USER_SQL, [caller.app_user_id])
    return str(rows[0]["id"]) if rows else None


def _own_or_404(caller, driver_id, what: str) -> None:
    """El rol Chofer solo accede a lo que es de su conductor; el resto (administrador) no se restringe."""
    if caller.role_name != logic.DRIVER_ROLE:
        return
    mine = _my_driver(caller)
    if mine is None:
        raise HttpError(403, "Tu usuario no está enlazado a un conductor.")
    if driver_id is None or str(driver_id) != mine:
        raise HttpError(404, f"{what} no encontrado")


def _check_country(caller, country_id) -> None:
    allowed = caller.country_filter
    if allowed is not None and country_id is not None and str(country_id) not in allowed:
        raise HttpError(403, "Tu rol no tiene acceso a ese país.")


def _iso(value) -> str | None:
    if value is None:
        return None
    return (value if value.tzinfo else value.replace(tzinfo=timezone.utc)).isoformat()


def _float(value) -> float | None:
    return None if value is None else float(value)


def _coords(lat, lng) -> tuple[float, float] | None:
    return None if lat is None or lng is None else (float(lat), float(lng))


def _viaje(row: dict, counts: dict | None, now: datetime, extra: dict | None = None) -> dict:
    """Vista de un viaje. `extra`: incidents, pickups, returns, metrics, review_row, delay_min, stopped_min."""
    extra = extra or {}
    state = logic.route_state(row["status"])
    sig = logic.signal(row["last_position_at"], now) if state == "active" else "none"
    counts = counts or {"total": 0, "delivered": 0, "failed": 0}
    done = int(counts["delivered"]) + int(counts["failed"])
    total = int(counts["total"])
    position = _coords(row["last_lat"], row["last_lng"])
    phase = None
    if state == "active":
        departed = done > 0 or logic.is_departed(position, _coords(row["origin_lat"], row["origin_lng"]))
        phase = "en_ruta" if departed else "por_salir"
    incidents = int(extra.get("incidents") or 0)
    delay = extra.get("delay_min")
    return {
        "id": str(row["id"]),
        "route_number": row["route_number"],
        "state": state,
        "status_raw": row["status"],
        "phase": phase,
        "signal": sig,
        "color": logic.map_color(state, sig),
        "driver_name": row["driver_name"],
        "plate": row["plate"],
        "carrier_name": row["carrier_name"],
        "zone_name": row["zone_name"],
        "started_at": _iso(row["actual_start_time"]),
        "ended_at": _iso(row["actual_end_time"]),
        "planned_end_at": _iso(row["planned_end_time"]),
        "total_distance_km": _float(row["total_distance"]),
        "capacity_percentage": _float(row["capacity_percentage"]),
        "route_date": row["route_date"].isoformat() if row["route_date"] else None,
        "position": None if position is None else {
            "lat": position[0], "lng": position[1],
            "speed_mps": _float(row["speed_mps"]), "heading_deg": _float(row["heading_deg"]),
            "battery_pct": row["battery_pct"], "recorded_at": _iso(row["last_position_at"]),
        },
        "progress": {"total": total, "done": done, "delivered": int(counts["delivered"]),
                     "failed": int(counts["failed"]), "percent": round(done * 100 / total) if total else 0},
        "delay_min": delay,
        "incidents": incidents,
        "alerts": logic.alerts(state, sig, int(counts["failed"]), incidents, delay, int(extra.get("stopped_min") or 0)),
        "review": _review(state, extra),
    }


def _review(state: str, extra: dict) -> dict | None:
    """Semáforo + estado de revisión de un viaje completado (None para los demás)."""
    if state != "completed":
        return None
    metrics = dict(extra.get("metrics") or {})
    metrics.update({"incidents": extra.get("incidents"), "pickups": extra.get("pickups"),
                    "returns": extra.get("returns")})
    summary = logic.review_summary(metrics)
    row = extra.get("review_row")
    summary.update({"reviewed_at": _iso(row["reviewed_at"]) if row else None,
                    "reviewed_by": row["reviewed_by_name"] if row else None,
                    "note": row["note"] if row else None})
    return summary


def _by_route(rows: list[dict]) -> dict[str, dict]:
    return {str(r["route_id"]): r for r in rows}


def _extras(page: list[dict], counts: dict[str, dict], now: datetime) -> dict[str, dict]:
    """Datos de alertas y semáforo para la lista (consultas por lote, no por viaje)."""
    ids = [str(r["id"]) for r in page]
    if not ids:
        return {}
    events = _by_route(pg.query(sql.EVENT_COUNTS_SQL, [ids]))
    done_ids = [str(r["id"]) for r in page if logic.route_state(r["status"]) == "completed"]
    metrics = returns = reviews = {}
    if done_ids:
        metrics = _by_route(pg.query(sql.REVIEW_METRICS_SQL, [done_ids]))
        returns = _by_route(pg.query(sql.RETURN_COUNTS_SQL, [done_ids]))
        reviews = _by_route(pg.query(sql.REVIEWS_SQL, [done_ids]))
    extras = {}
    for row in page:
        rid = str(row["id"])
        planned = (counts.get(rid) or {}).get("next_planned")
        extras[rid] = {
            "incidents": (events.get(rid) or {}).get("incidents"),
            "pickups": (events.get(rid) or {}).get("pickups"),
            "returns": (returns.get(rid) or {}).get("returns"),
            "metrics": metrics.get(rid), "review_row": reviews.get(rid),
            "delay_min": None if planned is None else round((now - logic._aware(planned)).total_seconds() / 60),
        }
    return extras


def _route_access(caller, org_id: str, route_id: str) -> dict:
    rows = pg.query(sql.ROUTE_ROW_SQL, [route_id])
    if not rows or str(rows[0]["organization_id"]) != org_id:
        raise HttpError(404, "Viaje no encontrado")
    _check_country(caller, rows[0]["country_id"])
    _own_or_404(caller, rows[0]["driver_id"], "Viaje")
    return rows[0]


def _event(run, org_id, route_id, guide_id, event_type, event_status, notes, user_id, lat=None, lng=None, when=None,
           distance_m=None):
    run(sql.INSERT_EVENT_SQL, [org_id, route_id, guide_id, event_type, event_status, when or _now(),
                               lat, lng, notes, user_id, distance_m])


# --- lectura -------------------------------------------------------------------------------------

def list_viajes(event: dict) -> dict:
    caller, org_id = _caller(event, "view")
    query = query_params(event)
    try:
        limit = max(1, min(int(query.get("limit") or DEFAULT_LIMIT), MAX_LIMIT))
    except ValueError:
        raise HttpError(400, "limit inválido") from None
    where, params = ["r.organization_id = %s"], [org_id]
    if str(query.get("activos", "")).lower() in ("1", "true", "si", "sí"):
        where.append("lower(r.status) = ANY(%s)")
        params.append(logic.ACTIVE_STATUS_SQL_VALUES)
    if str(query.get("por_revisar", "")).lower() in ("1", "true", "si", "sí"):
        where.append("lower(r.status) = ANY(%s)")
        params.append(logic.COMPLETED_STATUS_SQL_VALUES)
        where.append("NOT EXISTS (SELECT 1 FROM tracking_reviews tr WHERE tr.route_id = r.id)")
    allowed = caller.country_filter
    if allowed is not None:
        where.append("s.country_id = ANY(%s::uuid[])")
        params.append(list(allowed))
    search = (query.get("q") or "").strip()
    if search:
        where.append("(r.route_number ILIKE %s OR d.full_name ILIKE %s OR v.plate ILIKE %s)")
        params += [f"%{search}%"] * 3
    cursor = query.get("cursor")
    if cursor:
        sort_at, _, last_id = cursor.partition("|")
        if not logic.is_uuid(last_id):
            raise HttpError(400, "cursor inválido")
        where.append("(COALESCE(r.actual_start_time, r.created_at), r.id) < (%s::timestamptz, %s::uuid)")
        params += [sort_at, last_id]
    rows = pg.query(
        f"SELECT {sql.VIAJE_COLUMNS} {sql.VIAJE_JOINS} WHERE {' AND '.join(where)} "
        "ORDER BY sort_at DESC, r.id DESC LIMIT %s", params + [limit + 1])
    page, has_more = rows[:limit], len(rows) > limit
    ids = [str(row["id"]) for row in page]
    counts = {str(c["route_id"]): c for c in pg.query(sql.PROGRESS_SQL, [ids])} if ids else {}
    now = _now()
    next_cursor = f"{_iso(page[-1]['sort_at'])}|{page[-1]['id']}" if has_more else None
    extras = _extras(page, counts, now)
    return _ok({"items": [_viaje(row, counts.get(str(row["id"])), now, extras.get(str(row["id"]))) for row in page],
                "next_cursor": next_cursor})


def get_viaje(event: dict) -> dict:
    caller, org_id = _caller(event, "view", driver_ok=True)
    route_id = path_param(event, "id")
    if not logic.is_uuid(route_id):
        raise HttpError(404, "Viaje no encontrado")
    _route_access(caller, org_id, route_id)
    return _ok(_detail(route_id))


def _detail(route_id: str, sign_urls: bool = True) -> dict:
    """Detalle de un viaje (paradas, eventos, rastro). `sign_urls=False`: la app del chofer no necesita las
    miniaturas de evidencias (y así no firma URLs de S3 que no usa)."""
    row = pg.query(sql.ROUTE_ONE_SQL, [route_id])[0]
    guides = pg.query(sql.GUIDES_SQL, [route_id])
    guide_ids = [str(g["id"]) for g in guides]
    counts = {"total": len(guides),
              "delivered": sum(logic.guide_state(g["delivery_status"], g["status"]) == logic.GUIDE_DELIVERED for g in guides),
              "failed": sum(logic.guide_state(g["delivery_status"], g["status"]) == logic.GUIDE_FAILED for g in guides)}
    evidences = pg.query(sql.EVIDENCES_SQL, [route_id])
    returns = pg.query(sql.RETURNS_SQL, [guide_ids]) if guide_ids else []
    events = pg.query(sql.EVENTS_SQL, [route_id])
    trail = pg.query(sql.TRAIL_SQL, [route_id])

    def sign(ev: dict) -> dict:
        url = s3().generate_presigned_url("get_object", Params={"Bucket": bucket(), "Key": ev["storage_key"]},
                                          ExpiresIn=logic.URL_TTL_SECONDS) if sign_urls else None
        return {"id": str(ev["id"]), "kind": ev["kind"], "mime_type": ev["mime_type"],
                "captured_at": _iso(ev["captured_at"]), "url": url}

    by_guide_ev: dict[str, list] = {}
    for ev in evidences:
        by_guide_ev.setdefault(str(ev["dispatch_guide_id"]), []).append(sign(ev))
    by_guide_ret: dict[str, list] = {}
    for ret in returns:
        by_guide_ret.setdefault(str(ret["dispatch_guide_id"]), []).append(
            {k: (str(v) if k == "id" else v) for k, v in ret.items() if k != "dispatch_guide_id"})
    notes_by_guide: dict[str, list] = {}
    for ev in events:
        if ev["event_type"] in ("incident", "pickup") and ev["dispatch_guide_id"]:
            notes_by_guide.setdefault(str(ev["dispatch_guide_id"]), []).append(
                {"at": _iso(ev["event_time"]), "text": ev["notes"], "kind": ev["event_type"]})

    now = _now()
    state = logic.route_state(row["status"])
    position = _coords(row["last_lat"], row["last_lng"])
    origin = _coords(row["origin_lat"], row["origin_lng"])
    chronological = list(reversed(trail))
    stop_inputs = [{
        "id": str(g["id"]), "state": logic.guide_state(g["delivery_status"], g["status"]),
        "sequence": g["sequence_number"], "lat": _float(g["latitude"]), "lng": _float(g["longitude"]),
        "planned_arrival": g["planned_arrival_time"]} for g in guides]
    live = (logic.stop_metrics(position, stop_inputs, now) if state == "active"
            else {"by_stop": {}, "next_stop_id": None, "delay_min": None})

    def stop_timing(g: dict, stop_id: str) -> dict:
        metrics = live["by_stop"].get(stop_id)
        delay = None
        if g["actual_arrival_time"] is not None and g["planned_arrival_time"] is not None:
            gap = logic._aware(g["actual_arrival_time"]) - logic._aware(g["planned_arrival_time"])
            delay = round(gap.total_seconds() / 60)
        return {
            "planned_arrival_at": _iso(g["planned_arrival_time"]),
            "distance_m": metrics["distance_m"] if metrics else None,
            "eta_at": _iso(metrics["eta_at"]) if metrics else None,
            "delay_min": metrics["delay_min"] if metrics else delay,
        }

    stops = [{
        "id": str(g["id"]), "guide_number": g["guide_number"], "sequence": g["sequence_number"],
        "state": logic.guide_state(g["delivery_status"], g["status"]),
        "order_number": g["order_number"], "invoice_number": g["invoice_number"],
        "customer_name": g["customer_name"], "customer_phone": g["customer_phone"],
        "address": g["delivery_address"], "city": g["delivery_city"],
        "items": g["total_items"], "weight": _float(g["total_weight"]),
        "lat": _float(g["latitude"]), "lng": _float(g["longitude"]),
        "arrived_at": _iso(g["actual_arrival_time"]), "recipient_name": g["recipient_name"],
        "evidences": by_guide_ev.get(str(g["id"]), []),
        "incidents": notes_by_guide.get(str(g["id"]), []),
        "returns": by_guide_ret.get(str(g["id"]), []),
        **stop_timing(g, str(g["id"])),
    } for g in guides]

    event_counts = {"incident": 0, "pickup": 0}
    for ev in events:
        if ev["event_type"] in event_counts:
            event_counts[ev["event_type"]] += 1
    extra = {"incidents": event_counts["incident"], "pickups": event_counts["pickup"], "returns": len(returns),
             "delay_min": live["delay_min"], "stopped_min": logic.stopped_minutes(chronological, now)}
    if state == "completed":
        extra["metrics"] = (pg.query(sql.REVIEW_METRICS_SQL, [[route_id]]) or [None])[0]
        extra["review_row"] = (pg.query(sql.REVIEWS_SQL, [[route_id]]) or [None])[0]
    departed_at = (logic.first_departure(pg.query(sql.FIRST_POSITIONS_SQL, [route_id]), origin)
                   if state in ("active", "completed") and position else None)

    data = _viaje(row, counts, now, extra)
    data.update({
        "stops": stops,
        "next_stop_id": live["next_stop_id"],
        "departed_at": _iso(departed_at),
        "events": [{"id": str(e["id"]), "type": e["event_type"], "status": e["event_status"],
                    "at": _iso(e["event_time"]), "notes": e["notes"],
                    "stop_id": None if e["dispatch_guide_id"] is None else str(e["dispatch_guide_id"])}
                   for e in events],
        "trail": [{"lat": _float(p["latitude"]), "lng": _float(p["longitude"]), "at": _iso(p["recorded_at"])}
                  for p in chronological],
    })
    return data


def summary(event: dict) -> dict:
    """KPIs para la franja superior: viajes en ruta, retrasos, entregas, novedades, por revisar."""
    caller, org_id = _caller(event, "view")
    allowed = caller.country_filter
    where, params = ["r.organization_id = %s", "lower(r.status) = ANY(%s)"], [org_id, logic.ACTIVE_STATUS_SQL_VALUES]
    country = ""
    if allowed is not None:
        where.append("s.country_id = ANY(%s::uuid[])")
        params.append(list(allowed))
        country = "AND s.country_id = ANY(%s::uuid[])"
    rows = pg.query(f"SELECT {sql.VIAJE_COLUMNS} {sql.VIAJE_JOINS} WHERE {' AND '.join(where)} "
                    "ORDER BY sort_at DESC LIMIT 300", params)
    ids = [str(r["id"]) for r in rows]
    counts = {str(c["route_id"]): c for c in pg.query(sql.PROGRESS_SQL, [ids])} if ids else {}
    now = _now()
    extras = _extras(rows, counts, now)
    viajes = [_viaje(r, counts.get(str(r["id"])), now, extras.get(str(r["id"]))) for r in rows]
    pending_params = [org_id, logic.COMPLETED_STATUS_SQL_VALUES] + ([list(allowed)] if allowed is not None else [])
    pending = pg.query(sql.PENDING_REVIEW_COUNT_SQL.format(country=country), pending_params)
    late = [v for v in viajes if any(a["code"] == logic.ALERT_LATE for a in v["alerts"])]
    return _ok({
        "active": len(viajes),
        "departing": sum(v["phase"] == "por_salir" for v in viajes),
        "late": len(late),
        "on_time": len(viajes) - len(late),
        "no_signal": sum(any(a["code"] == logic.ALERT_NO_SIGNAL for a in v["alerts"]) for v in viajes),
        "stops_done": sum(v["progress"]["done"] for v in viajes),
        "stops_total": sum(v["progress"]["total"] for v in viajes),
        "incidents": sum(v["incidents"] for v in viajes),
        "to_review": int(pending[0]["n"]) if pending else 0,
    })


def list_planificados(event: dict) -> dict:
    caller, org_id = _caller(event, "view")
    allowed = caller.country_filter
    params = [org_id]
    country = ""
    if allowed is not None:
        country = "AND rp.country_id = ANY(%s::uuid[])"
        params.append(list(allowed))
    rows = pg.query(sql.PLANNED_SQL.format(country=country), params)
    return _ok([{"plan_trip_id": str(r["plan_trip_id"]), "plan_date": r["plan_date"].isoformat(),
                 "zone": r["delivery_zone"], "plate": r["plate"], "driver_name": r["driver_name"],
                 "stops": int(r["stops"])} for r in rows])


# --- escritura -----------------------------------------------------------------------------------

def start_viaje(event: dict) -> dict:
    """Puente Planificación → ejecución: crea routes + dispatch_guides desde plan_trips/plan_stops."""
    caller, org_id = _caller(event, "create")
    trip_id = path_param(event, "id")
    if not logic.is_uuid(trip_id):
        raise HttpError(404, "Viaje planificado no encontrado")

    def work(run):
        rows = run(sql.PLAN_TRIP_SQL, [trip_id])
        if not rows or str(rows[0]["organization_id"]) != org_id:
            raise HttpError(404, "Viaje planificado no encontrado")
        trip = rows[0]
        _check_country(caller, trip["country_id"])
        existing = run(sql.ROUTE_BY_PLAN_TRIP_SQL, [trip_id])
        if existing:
            return {"route_id": str(existing[0]["id"]), "created": False}
        if trip["plan_status"] != "confirmed":
            raise HttpError(409, "El plan debe estar confirmado para iniciar el viaje.")
        if trip["status"] != "pending":
            raise HttpError(409, "El viaje planificado ya no está pendiente.")
        stops = run(sql.PLAN_STOPS_SQL, [trip_id])
        if not stops:
            raise HttpError(409, "El viaje planificado no tiene paradas.")
        stores = run(sql.ORIGIN_STORE_SQL, [org_id, trip["country_id"]])
        if not stores:
            raise HttpError(409, "No hay una tienda de origen configurada para el país del plan.")
        zone = run(sql.ZONE_SQL, [org_id, trip["delivery_zone"], trip["delivery_zone"]]) if trip["delivery_zone"] else []
        route_number = f"VJ-{trip['plan_date'].strftime('%Y%m%d')}-{str(trip['id'])[:8].upper()}"
        # Horas planificadas (salida = ahora): referencia fija para medir el retraso. Planificación no las guarda.
        plan = logic.plan_schedule(_coords(stores[0]["latitude"], stores[0]["longitude"]),
                                   [{"lat": _float(st["lat"]), "lng": _float(st["lng"])} for st in stops], _now())
        capacity = None
        if trip["total_weight"] is not None and trip["vehicle_capacity_weight"]:
            capacity = round(float(trip["total_weight"]) * 100 / float(trip["vehicle_capacity_weight"]), 2)
        route = run(sql.INSERT_ROUTE_SQL, [
            org_id, stores[0]["id"], trip["driver_id"], trip["vehicle_id"], trip["carrier_id"], route_number,
            trip["plan_date"], len(stops), trip["total_weight"], trip["total_volume"],
            "Iniciado desde Planificación (tracking en vivo).", zone[0]["id"] if zone else None, trip_id,
            plan["end"], plan["total_km"], capacity])
        route_id = route[0]["id"]
        for index, stop in enumerate(stops, start=1):
            run(sql.INSERT_GUIDE_SQL, [org_id, route_id, stop["order_id"], f"{route_number}-{index}", index,
                                       "Generada al iniciar el viaje desde Planificación.",
                                       plan["arrivals"][index - 1]])
        _event(run, org_id, route_id, None, "route_started", "info", "Viaje iniciado", caller.app_user_id)
        return {"route_id": str(route_id), "created": True, "route_number": route_number}

    result = pg.run_in_transaction(work)
    return _ok(result, 201 if result["created"] else 200)


def complete_viaje(event: dict) -> dict:
    caller, org_id = _caller(event, "edit")
    route_id = path_param(event, "id")
    if not logic.is_uuid(route_id):
        raise HttpError(404, "Viaje no encontrado")
    body = json_body(event)
    force = isinstance(body, dict) and bool(body.get("force"))

    def work(run):
        route = run(sql.ROUTE_ROW_SQL, [route_id])
        if not route or str(route[0]["organization_id"]) != org_id:
            raise HttpError(404, "Viaje no encontrado")
        _check_country(caller, route[0]["country_id"])
        if logic.route_state(route[0]["status"]) != "active":
            raise HttpError(409, "Solo se puede completar un viaje en tránsito.")
        counts = run(sql.COUNT_DONE_SQL, [route_id])[0]
        if int(counts["pending"]) and not force:
            raise HttpError(409, f"Quedan {int(counts['pending'])} parada(s) sin cerrar.")
        run(sql.COMPLETE_ROUTE_SQL, [int(counts["done"]), route_id])
        _event(run, org_id, route_id, None, "route_completed", "success", "Viaje completado", caller.app_user_id)
        return {"route_id": route_id, "pending": int(counts["pending"])}

    return _ok(pg.run_in_transaction(work))


def review_viaje(event: dict) -> dict:
    """El administrador marca un viaje COMPLETADO como revisado (quién y cuándo; nota opcional)."""
    caller, org_id = _caller(event, "edit")
    route_id = path_param(event, "id")
    if not logic.is_uuid(route_id):
        raise HttpError(404, "Viaje no encontrado")
    body = json_body(event)
    note = ((body.get("note") if isinstance(body, dict) else None) or "").strip() or None
    if note and len(note) > 500:
        raise HttpError(400, "La nota no puede superar 500 caracteres")

    def work(run):
        route = run(sql.ROUTE_ROW_SQL, [route_id])
        if not route or str(route[0]["organization_id"]) != org_id:
            raise HttpError(404, "Viaje no encontrado")
        _check_country(caller, route[0]["country_id"])
        if logic.route_state(route[0]["status"]) != "completed":
            raise HttpError(409, "Solo se puede revisar un viaje completado.")
        run(sql.UPSERT_REVIEW_SQL, [route_id, org_id, caller.app_user_id, note])
        _event(run, org_id, route_id, None, "route_reviewed", "info", note or "Viaje revisado", caller.app_user_id)
        return {"route_id": route_id}

    return _ok(pg.run_in_transaction(work))


def ingest_positions(event: dict) -> dict:
    caller, org_id = _caller(event, "create", driver_ok=True)
    body = json_body(event)
    positions = body.get("positions") if isinstance(body, dict) else None
    if not isinstance(positions, list) or not positions:
        raise HttpError(400, "positions debe ser una lista no vacía")
    if len(positions) > logic.MAX_BATCH:
        raise HttpError(400, f"Máximo {logic.MAX_BATCH} posiciones por lote")
    now, rejected, valid = _now(), [], []
    for raw in positions:
        try:
            valid.append(logic.validate_position(raw, now))
        except ValueError as err:
            rejected.append({"client_id": raw.get("client_id") if isinstance(raw, dict) else None, "reason": str(err)})
    if valid:
        routes = {str(r["id"]): r for r in pg.query(
            sql.ROUTES_FOR_POSITIONS_SQL, [org_id, sorted({p["route_id"] for p in valid})])}
        if caller.role_name == logic.DRIVER_ROLE:
            mine = _my_driver(caller)
            if mine is None:
                raise HttpError(403, "Tu usuario no está enlazado a un conductor.")
            # Un viaje ajeno se trata como inexistente: se rechaza el punto y no se escribe nada.
            routes = {rid: r for rid, r in routes.items() if str(r["driver_id"] or "") == mine}
        accepted_rows = []
        for pos in valid:
            route = routes.get(pos["route_id"])
            if route is None:
                rejected.append({"client_id": pos["client_id"], "reason": "viaje no encontrado"})
            elif logic.route_state(route["status"]) != "active":
                rejected.append({"client_id": pos["client_id"], "reason": "viaje no activo"})
            else:
                accepted_rows.append((pos, route))
        valid = accepted_rows
    device_id = body.get("device_id") if isinstance(body.get("device_id"), str) else None
    inserted = 0
    if valid:
        values, params = [], []
        for pos, route in valid:
            values.append(sql.POSITION_PLACEHOLDERS)
            params += [org_id, pos["route_id"], route["vehicle_id"], route["driver_id"], device_id,
                       pos["client_id"], pos["latitude"], pos["longitude"], pos["accuracy_m"], pos["speed_mps"],
                       pos["heading_deg"], pos["battery_pct"], pos["is_mock"], pos["recorded_at"]]
        inserted = len(pg.query(
            f"INSERT INTO tracking_positions ({sql.POSITION_COLUMNS}) VALUES {', '.join(values)} "
            "ON CONFLICT (client_id) DO NOTHING RETURNING client_id", params))
        newest: dict[str, dict] = {}
        for pos, _ in valid:
            if pos["route_id"] not in newest or pos["recorded_at"] > newest[pos["route_id"]]["recorded_at"]:
                newest[pos["route_id"]] = pos
        for route_id, pos in newest.items():
            pg.query(sql.UPSERT_LAST_POSITION_SQL, [route_id, org_id, pos["latitude"], pos["longitude"],
                                                    pos["speed_mps"], pos["heading_deg"], pos["battery_pct"],
                                                    pos["recorded_at"]])
    return _ok({"accepted": inserted, "duplicates": len(valid) - inserted, "rejected": rejected})


def _guide_access(caller, org_id: str, guide_id: str) -> dict:
    if not logic.is_uuid(guide_id):
        raise HttpError(404, "Parada no encontrada")
    rows = pg.query(sql.GUIDE_ROW_SQL, [guide_id])
    if not rows or str(rows[0]["organization_id"]) != org_id:
        raise HttpError(404, "Parada no encontrada")
    _check_country(caller, rows[0]["country_id"])
    _own_or_404(caller, rows[0]["driver_id"], "Parada")
    return rows[0]


def transition_stop(event: dict) -> dict:
    caller, org_id = _caller(event, "edit", driver_ok=True)
    guide_id = path_param(event, "id")
    body = json_body(event)
    body = body if isinstance(body, dict) else {}
    target = body.get("to")
    if target not in logic.GUIDE_STATUS_TEXT:
        raise HttpError(400, "to debe ser pending, delivered o failed")
    reason = (body.get("reason") or "").strip() or None
    if target == logic.GUIDE_FAILED and not reason:
        raise HttpError(400, "Una entrega fallida requiere un motivo")
    try:
        when = logic.parse_time(body["occurred_at"], "occurred_at") if body.get("occurred_at") else _now()
    except ValueError as err:
        raise HttpError(400, str(err)) from None
    lat, lng = logic.coords(body)
    guide = _guide_access(caller, org_id, guide_id)
    if logic.route_state(guide["route_status"]) != "active":
        raise HttpError(409, "El viaje no está en tránsito.")
    route_id = str(guide["route_id"])
    receiver = (body.get("receiver_name") or "").strip() or None
    note = f"{guide['notes'] or ''}\nFallo: {reason}".strip() if reason and target == logic.GUIDE_FAILED else None
    # Geocerca (auditoría): distancia del dispositivo al punto. Fuera de 150 m, "Entregado" exige motivo.
    # Sin lat/lng (o sin coordenadas de la parada) no se puede medir: se acepta, como la web del administrador.
    distance_m = None if target == logic.GUIDE_PENDING else logic.distance_to_stop_m(
        lat, lng, guide["stop_lat"], guide["stop_lng"])
    outside = target == logic.GUIDE_DELIVERED and distance_m is not None and distance_m > logic.GEOFENCE_M
    if outside and not reason:
        raise HttpError(400, f"Estás a {distance_m} m del punto de entrega (máximo {logic.GEOFENCE_M} m): "
                             "indica el motivo.")
    event_type = {"delivered": "delivery_completed", "failed": "delivery_failed", "pending": "stop_reverted"}[target]
    event_status = {"delivered": "success", "failed": "error", "pending": "info"}[target]

    def work(run):
        run(sql.UPDATE_GUIDE_SQL, [target, logic.GUIDE_STATUS_TEXT[target], None if target == "pending" else when,
                                   receiver, note, guide_id])
        counts = run(sql.COUNT_DONE_SQL, [route_id])[0]
        run(sql.SET_COMPLETED_STOPS_SQL, [int(counts["done"]), route_id])
        _event(run, org_id, route_id, guide_id, event_type, event_status, reason, caller.app_user_id,
               lat, lng, when, distance_m)
        if outside:
            _event(run, org_id, route_id, guide_id, "incident", "warning",
                   f"Entrega fuera de la geocerca ({distance_m} m): {reason}", caller.app_user_id, lat, lng, when)
        return {"stop_id": guide_id, "state": target, "done": int(counts["done"]), "pending": int(counts["pending"]),
                "distance_m": distance_m}

    return _ok(pg.run_in_transaction(work))


def add_incident(event: dict) -> dict:
    caller, org_id = _caller(event, "edit", driver_ok=True)
    guide_id = path_param(event, "id")
    body = json_body(event)
    description = ((body.get("description") if isinstance(body, dict) else None) or "").strip()
    if not description:
        raise HttpError(400, "La novedad requiere una descripción")
    kind = (body.get("kind") if isinstance(body, dict) else None) or "incident"
    if kind not in ("incident", "pickup"):
        raise HttpError(400, "kind debe ser incident o pickup")
    lat, lng = logic.coords(body)
    guide = _guide_access(caller, org_id, guide_id)

    def work(run):
        _event(run, org_id, guide["route_id"], guide_id, kind, "warning" if kind == "incident" else "info",
               description, caller.app_user_id, lat, lng)

    pg.run_in_transaction(work)
    return _ok({"stop_id": guide_id}, 201)


def evidence_upload_url(event: dict) -> dict:
    caller, org_id = _caller(event, "edit", driver_ok=True)
    guide_id = path_param(event, "id")
    kind, mime = logic.require_evidence_request(json_body(event))
    guide = _guide_access(caller, org_id, guide_id)
    key = logic.new_evidence_key(str(guide["route_id"]), guide_id, mime)
    form = s3().generate_presigned_post(
        bucket(), key, Fields={"Content-Type": mime},
        Conditions=[{"Content-Type": mime}, ["content-length-range", 1, logic.MAX_EVIDENCE_BYTES]],
        ExpiresIn=logic.URL_TTL_SECONDS)
    return _ok({"url": form["url"], "fields": form["fields"], "key": key, "kind": kind,
                "max_bytes": logic.MAX_EVIDENCE_BYTES})


def _head(key: str) -> dict | None:
    try:
        return s3().head_object(Bucket=bucket(), Key=key)
    except Exception as err:  # botocore ClientError (sin importar botocore aquí)
        code = getattr(err, "response", {}).get("Error", {}).get("Code")
        if code in ("404", "NoSuchKey", "NotFound"):
            return None
        raise


def evidence_confirm(event: dict) -> dict:
    caller, org_id = _caller(event, "edit", driver_ok=True)
    guide_id = path_param(event, "id")
    body = json_body(event)
    body = body if isinstance(body, dict) else {}
    kind, _ = logic.require_evidence_request({"kind": body.get("kind"), "mime_type": "image/jpeg"})
    lat, lng = logic.coords(body)
    guide = _guide_access(caller, org_id, guide_id)
    route_id = str(guide["route_id"])
    key = logic.require_evidence_key(route_id, guide_id, body.get("key"))
    head = logic.require_uploaded_image(_head(key))
    client_id = body.get("client_id") if logic.is_uuid(body.get("client_id")) else None
    try:
        captured = logic.parse_time(body["captured_at"], "captured_at") if body.get("captured_at") else _now()
    except ValueError as err:
        raise HttpError(400, str(err)) from None

    def work(run):
        created = run(sql.INSERT_EVIDENCE_SQL, [org_id, route_id, guide_id, kind, key, head["ContentType"],
                                                int(head["ContentLength"]), captured, lat,
                                                lng, client_id, caller.app_user_id])
        if kind == "signature":
            run(sql.SET_GUIDE_SIGNATURE_SQL, [key, guide_id])
        elif kind == "photo_invoice":
            run(sql.SET_GUIDE_PHOTO_SQL, [key, guide_id])
        return {"evidence_id": str(created[0]["id"]) if created else None, "duplicate": not created}

    return _ok(pg.run_in_transaction(work), 201)


def add_return(event: dict) -> dict:
    """Devolución registrada por el chofer en la parada (alimenta `returns`, que la web ya lee)."""
    caller, org_id = _caller(event, "edit", driver_ok=True)
    guide_id = path_param(event, "id")
    body = json_body(event)
    body = body if isinstance(body, dict) else {}
    product = (body.get("product_name") or "").strip()
    reason = (body.get("reason") or "").strip()
    if not product:
        raise HttpError(400, "La devolución requiere el producto")
    if not reason:
        raise HttpError(400, "La devolución requiere un motivo")
    quantity = body.get("quantity")
    if isinstance(quantity, bool) or not isinstance(quantity, int) or not 0 < quantity <= 100000:
        raise HttpError(400, "quantity debe ser un entero mayor que 0")
    client_id = body.get("client_id")
    if client_id is not None and not logic.is_uuid(client_id):
        raise HttpError(400, "client_id inválido")
    guide = _guide_access(caller, org_id, guide_id)
    if logic.route_state(guide["route_status"]) != "active":
        raise HttpError(409, "El viaje no está en tránsito.")
    photo = body.get("photo_key")
    if photo is not None:
        photo = logic.require_evidence_key(str(guide["route_id"]), guide_id, photo)
    code = (body.get("product_code") or "").strip() or None
    notes = (body.get("notes") or "").strip() or None
    # El número de devolución sale del client_id: reenviar la misma devolución no la duplica.
    number = f"DV-{client_id or uuid.uuid4()}"

    def work(run):
        created = run(sql.INSERT_RETURN_SQL, [org_id, guide_id, guide["order_id"], number, reason, code, product,
                                              quantity, photo, notes])
        if created:
            _event(run, org_id, guide["route_id"], guide_id, "return", "warning",
                   f"Devolución: {quantity} x {product} ({reason})", caller.app_user_id)
        return {"return_id": str(created[0]["id"]) if created else None, "duplicate": not created}

    result = pg.run_in_transaction(work)
    return _ok(result, 200 if result["duplicate"] else 201)


def record_consent(event: dict) -> dict:
    """Consentimiento GPS del chofer (B6): una fila por usuario y versión del aviso; repetirlo no duplica."""
    caller, org_id = _caller(event, "view", driver_ok=True)
    body = json_body(event)
    body = body if isinstance(body, dict) else {}
    version = (body.get("version") or "").strip() if isinstance(body.get("version"), str) else ""
    if not version or len(version) > 40:
        raise HttpError(400, "version es obligatoria (máx. 40 caracteres)")
    device_id = body.get("device_id") if isinstance(body.get("device_id"), str) else None
    created = pg.query(sql.INSERT_CONSENT_SQL, [org_id, caller.app_user_id, version, device_id])
    row = created or pg.query(sql.CONSENT_SQL, [caller.app_user_id, version])
    return _ok({"version": version, "consented_at": _iso(row[0]["consented_at"]) if row else None,
                "duplicate": not created}, 201 if created else 200)


def my_trips(event: dict) -> dict:
    """Agenda del chofer: sus viajes en tránsito (con paradas y horas) y los planificados por iniciar."""
    caller, org_id = _caller(event, "view", driver_ok=True)
    driver_id = _my_driver(caller)
    if driver_id is None:
        raise HttpError(403, "Tu usuario no está enlazado a un conductor.")
    now = _now()
    routes = pg.query(sql.MY_ROUTES_SQL, [org_id, driver_id, logic.ACTIVE_STATUS_SQL_VALUES])
    items = []
    for row in routes:
        data = _detail(str(row["id"]), sign_urls=False)
        data.update({"kind": "route", "route_id": data["id"]})
        items.append(data)
    planned = pg.query(sql.MY_PLANNED_SQL, [org_id, driver_id, now.date() - timedelta(days=1)])
    stops_by_trip: dict[str, list] = {}
    if planned:
        for st in pg.query(sql.MY_PLANNED_STOPS_SQL, [[str(p["plan_trip_id"]) for p in planned]]):
            stops_by_trip.setdefault(str(st["trip_id"]), []).append({
                "id": str(st["order_id"]), "sequence": st["stop_order"], "state": logic.GUIDE_PENDING,
                "order_number": st["order_number"], "invoice_number": st["invoice_number"],
                "customer_name": st["customer_name"], "customer_phone": st["customer_phone"],
                "address": st["delivery_address"], "city": st["delivery_city"],
                "items": st["total_items"], "weight": _float(st["total_weight"]),
                "lat": _float(st["latitude"]), "lng": _float(st["longitude"])})
    for trip in planned:
        stops = stops_by_trip.get(str(trip["plan_trip_id"]), [])
        items.append({
            "kind": "planned", "id": str(trip["plan_trip_id"]), "route_id": None, "route_number": None,
            "state": "planned", "phase": "por_salir", "plan_date": trip["plan_date"].isoformat(),
            "zone_name": trip["delivery_zone"], "plate": trip["plate"], "driver_name": trip["driver_name"],
            "progress": {"total": len(stops), "done": 0, "delivered": 0, "failed": 0, "percent": 0},
            "stops": stops})
    return _ok({"items": items})


ROUTES = {
    "GET /api/v1/tracking/mi-viaje": my_trips,
    "POST /api/v1/tracking/consentimiento-gps": record_consent,
    "POST /api/v1/tracking/paradas/{id}/devoluciones": add_return,
    "GET /api/v1/tracking/viajes": list_viajes,
    "GET /api/v1/tracking/viajes/{id}": get_viaje,
    "GET /api/v1/tracking/planificados": list_planificados,
    "GET /api/v1/tracking/resumen": summary,
    "POST /api/v1/tracking/viajes/{id}/iniciar": start_viaje,
    "POST /api/v1/tracking/viajes/{id}/completar": complete_viaje,
    "POST /api/v1/tracking/viajes/{id}/revisar": review_viaje,
    "POST /api/v1/tracking/posiciones": ingest_positions,
    "POST /api/v1/tracking/paradas/{id}/transicion": transition_stop,
    "POST /api/v1/tracking/paradas/{id}/novedades": add_incident,
    "POST /api/v1/tracking/paradas/{id}/evidencias/upload-url": evidence_upload_url,
    "POST /api/v1/tracking/paradas/{id}/evidencias": evidence_confirm,
}

handler = tms_handler(ROUTES)
