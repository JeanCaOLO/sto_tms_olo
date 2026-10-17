"""Monitoreo de viajes en vivo (/api/v1/tracking/*). Solo observa lo que pasa en ruta: planear, asignar y
cancelar viajes es de Planificación.

Lectura (web): lista de viajes con progreso, alertas y última posición (`include=summary` agrega los KPIs),
detalle con paradas y evidencias de entrega, recorrido simplificado para el replay y los viajes planificados
listos para iniciar.
Escritura (app del chofer; iniciar solo en pruebas): iniciar viaje desde Planificación, ingesta de posiciones
por lotes, transición de parada y evidencias de entrega (factura firmada y firma; subida directa a S3). Tracking
NO termina viajes: los termina Planificación (completar/cancelar en plan_trips) y Tracking solo lee ese estado.
No hay endpoint de completar ni de revisar.

Permisos: módulo `tracking` (view para leer; create para iniciar e ingestar; edit para transicionar paradas y
evidencias) + país de la tienda de origen de la ruta.

App del chofer (rol `Chofer`): solo opera los viajes donde `routes.driver_id` es el conductor enlazado a su
usuario (`drivers.app_user_id`). Ve `mi-viaje`, el detalle y el recorrido de SUS viajes y escribe posiciones,
paradas, evidencias y consentimiento; lo demás (lista general, KPIs, iniciar) es del
administrador y le responde 403. Un viaje ajeno responde 404 (no revela que existe).
"""

import base64
import gzip
import os
import re
import time
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
UNIQUE_VIOLATION = "23505"   # SQLSTATE de unicidad (lo traduce tms_common.pg a HttpError 409 con code)
GZIP_MIN_BYTES = 1024        # por debajo, comprimir no compensa el base64

_s3 = None
_URL_CACHE: dict[str, tuple[str, float]] = {}  # storage_key -> (url firmada, vence en epoch s)


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


def _signed_get(key: str) -> str:
    """URL firmada de lectura. Estable: se reusa desde la caché del Lambda mientras le queden más de
    SIGNED_GET_RENEW_SECONDS; si no, se vuelve a firmar."""
    nowts = time.time()
    cached = _URL_CACHE.get(key)
    if cached and cached[1] - nowts > logic.SIGNED_GET_RENEW_SECONDS:
        return cached[0]
    url = s3().generate_presigned_url("get_object", Params={"Bucket": bucket(), "Key": key},
                                      ExpiresIn=logic.SIGNED_GET_TTL_SECONDS)
    if len(_URL_CACHE) >= 5000:  # tope de memoria: primero se van las vencidas
        for stale in [k for k, (_, expires) in _URL_CACHE.items() if expires <= nowts]:
            del _URL_CACHE[stale]
        if len(_URL_CACHE) >= 5000:
            _URL_CACHE.clear()
    _URL_CACHE[key] = (url, nowts + logic.SIGNED_GET_TTL_SECONDS)
    return url


_SAFE_TEXT = re.compile(r"^[\w .\-]+$")  # \w ya cubre letras acentuadas (unicode)
_PAIS = re.compile(r"^[A-Z]{2,3}$")


def _literal(value) -> str | None:
    """Literal SQL de un valor inofensivo (uuid, entero, palabra simple) o None si requiere parámetro."""
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return str(value)
    if isinstance(value, str) and (logic.is_uuid(value) or _SAFE_TEXT.match(value)):
        return f"'{value}'"
    return None


def _rq(query: str, params=()) -> list[dict]:
    """Lectura con un solo viaje de red: pg8000 usa 3 round-trips por consulta con parámetros y 1 sin
    ellos. Solo se inlinan uuids, enteros y palabras simples (ya validados); lo demás va como parámetro."""
    values = list(params)
    literals = []
    for value in values:
        if isinstance(value, (list, tuple)):
            items = [_literal(v) for v in value]
            literals.append(f"ARRAY[{', '.join(items)}]" if items and None not in items else None)
        else:
            literals.append(_literal(value))
    if None in literals or query.count("%s") != len(literals):
        return pg.query(query, values)
    parts = query.split("%s")
    return pg.query("".join(a + b for a, b in zip(parts, literals + [""])), [])


def _ok(data: object, status: int = 200) -> dict:
    return json_response(status, {"data": data, "error": None})


def _caller(event: dict, action: str, *, driver_ok: bool = False):
    caller = permissions.for_event(event)
    caller.require(MODULE, action)
    if caller.role_name == logic.DRIVER_ROLE and not driver_ok:
        raise HttpError(403, "Esta acción es del administrador.")
    rows = _rq(sql.ORG_SQL, [caller.app_user_id])
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


def _rej(pos: dict, reason: str) -> dict:
    return {"client_id": pos["client_id"], "reason": reason}


# --- vista de viajes ----------------------------------------------------------------------------------

def _live(state: str, position, guides: list[dict], now: datetime) -> dict:
    """ETA y retraso de las paradas pendientes: la MISMA regla para la lista y el detalle. Solo viajes en
    tránsito. Sin posición no hay ETA: los retrasos quedan en None (no se alerta sin datos)."""
    if state != "active":
        return {"by_stop": {}, "next_stop_id": None, "delay_min": None}
    result = logic.stop_metrics(position, logic.stop_inputs(guides), now)
    if position is None:
        for metrics in result["by_stop"].values():
            metrics["eta_at"] = metrics["delay_min"] = None
        result["delay_min"] = None
    return result


def _stopped(route_ids: list[str], now: datetime) -> dict[str, int]:
    """Minutos detenidos por ruta: UNA consulta de posiciones recientes para todas las rutas (tope de ventana)."""
    if not route_ids:
        return {}
    cutoff = now - timedelta(minutes=logic.STOPPED_WINDOW_MIN)
    return logic.stopped_by_route(_rq(sql.STOPPED_POSITIONS_SQL, [route_ids, cutoff]), now)


def _batch(rows: list[dict], now: datetime) -> dict:
    """Progreso, paradas y minutos detenidos de una página de viajes: una consulta por dato, nunca por viaje."""
    ids = [str(r["id"]) for r in rows]
    active = [str(r["id"]) for r in rows if logic.route_state(r["status"]) == "active"]
    counts = {str(c["route_id"]): c for c in _rq(sql.PROGRESS_SQL, [ids])} if ids else {}
    guides: dict[str, list] = {}
    for guide in (_rq(sql.STOPS_BATCH_SQL, [active]) if active else []):
        guides.setdefault(str(guide["route_id"]), []).append(guide)
    return {"counts": counts, "guides": guides, "stopped": _stopped(active, now)}


def _list_item(row: dict, batch: dict, now: datetime) -> dict:
    rid = str(row["id"])
    state = logic.route_state(row["status"])
    live = _live(state, _coords(row["last_lat"], row["last_lng"]), batch["guides"].get(rid, []), now)
    return _viaje(row, batch["counts"].get(rid), live, batch["stopped"].get(rid, 0), now)


def _viaje(row: dict, counts: dict | None, live: dict, stopped: int, now: datetime) -> dict:
    """Vista de un viaje (contrato v2). `live` viene de `_live`; `stopped` son minutos detenido."""
    state = logic.route_state(row["status"])
    sig = logic.signal(row["last_position_at"], now) if state == "active" else "none"
    counts = counts or {"total": 0, "delivered": 0, "failed": 0}
    done = int(counts["delivered"]) + int(counts["failed"])
    total = int(counts["total"])
    position = _coords(row["last_lat"], row["last_lng"])
    phase = None
    if state == "active":
        departed = (row["departed_at"] is not None or done > 0
                    or logic.is_departed(position, _coords(row["origin_lat"], row["origin_lng"])))
        phase = "en_ruta" if departed else "por_salir"
    delay = live["delay_min"]
    return {
        "id": str(row["id"]),
        "route_number": row["route_number"],
        "state": state,
        "phase": phase,
        "signal": sig,
        "color": logic.map_color(state, sig),
        "driver_name": row["driver_name"],
        "plate": row["plate"],
        "zone_name": row["zone_name"],
        "country": row["country"],
        "timezone": row["timezone"],
        "started_at": _iso(row["actual_start_time"]),
        "ended_at": _iso(row["actual_end_time"]),
        "planned_end_at": _iso(row["planned_end_time"]),
        "route_date": row["route_date"].isoformat() if row["route_date"] else None,
        "position": None if position is None else {
            "lat": position[0], "lng": position[1],
            "speed_mps": _float(row["speed_mps"]), "recorded_at": _iso(row["last_position_at"]),
        },
        "progress": {"total": total, "done": done, "delivered": int(counts["delivered"]),
                     "failed": int(counts["failed"]), "percent": round(done * 100 / total) if total else 0},
        "delay_min": delay,
        "alerts": logic.alerts(state, sig, int(counts["failed"]), delay, stopped),
    }


def _scope(caller, org_id: str, query: dict, *, only_active: bool) -> tuple[list[str], list]:
    """Cláusulas WHERE comunes a la lista y a los KPIs: organización, activos, país (pais ∩ rol)."""
    where, params = ["r.organization_id = %s"], [org_id]
    if only_active:
        # Activo = en tránsito en Tracking Y no terminado en Planificación (que es quien cierra el viaje).
        where.append(f"lower(r.status) = ANY(%s) AND {sql.OPEN_IN_PLAN}")
        params.append(logic.ACTIVE_STATUS_SQL_VALUES)
    raw = (query.get("pais") or "").strip().upper()
    if raw:
        if not _PAIS.match(raw):
            raise HttpError(400, "pais inválido")
        where.append("co.code = %s")
        params.append(raw)
    allowed = caller.country_filter
    if allowed is not None:
        where.append("s.country_id = ANY(%s::uuid[])")
        params.append(list(allowed))
    return where, params


def _summary(caller, org_id: str, query: dict, now: datetime) -> dict:
    """KPIs de TODOS los viajes activos del alcance (no solo la página). Consultas por lote, no por viaje."""
    where, params = _scope(caller, org_id, query, only_active=True)
    rows = _rq(f"SELECT {sql.VIAJE_COLUMNS} {sql.VIAJE_JOINS} WHERE {' AND '.join(where)} ORDER BY sort_at DESC",
               params)
    batch = _batch(rows, now)
    viajes = [_list_item(row, batch, now) for row in rows]
    late = sum(any(a["code"] == logic.ALERT_LATE for a in v["alerts"]) for v in viajes)
    no_signal = sum(any(a["code"] == logic.ALERT_NO_SIGNAL for a in v["alerts"]) for v in viajes)
    # Completados hoy en el día local del país (timezone de countries).
    where, params = _scope(caller, org_id, query, only_active=False)
    where += [f"lower({sql.STATUS_EXPR}) = ANY(%s)", f"{sql.END_EXPR} IS NOT NULL",
              f"({sql.END_EXPR} AT TIME ZONE coalesce(co.timezone, 'UTC'))::date"
              " = (%s::timestamptz AT TIME ZONE coalesce(co.timezone, 'UTC'))::date"]
    params += [logic.COMPLETED_STATUS_SQL_VALUES, now]
    today = _rq(sql.COMPLETED_TODAY_SQL.format(where=" AND ".join(where)), params)
    return {
        "active": len(viajes),
        "on_time": len(viajes) - late,
        "late": late,
        "no_signal": no_signal,
        "completed_today": int(today[0]["n"]) if today else 0,
    }


def _route_access(caller, org_id: str, route_id: str) -> dict:
    rows = _rq(sql.ROUTE_ROW_SQL, [route_id])
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
    only_active = str(query.get("activos", "")).lower() in ("1", "true", "si", "sí")
    where, params = _scope(caller, org_id, query, only_active=only_active)
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
    rows = _rq(
        f"SELECT {sql.VIAJE_COLUMNS} {sql.VIAJE_JOINS} WHERE {' AND '.join(where)} "
        "ORDER BY sort_at DESC, r.id DESC LIMIT %s", params + [limit + 1])
    page, has_more = rows[:limit], len(rows) > limit
    now = _now()
    batch = _batch(page, now)
    data = {"items": [_list_item(row, batch, now) for row in page],
            "next_cursor": f"{_iso(page[-1]['sort_at'])}|{page[-1]['id']}" if has_more else None}
    # El resumen solo viaja en la primera página (sin cursor).
    if not cursor and "summary" in (query.get("include") or "").split(","):
        data["summary"] = _summary(caller, org_id, query, now)
    return _ok(data)


def get_viaje(event: dict) -> dict:
    caller, org_id = _caller(event, "view", driver_ok=True)
    route_id = path_param(event, "id")
    if not logic.is_uuid(route_id):
        raise HttpError(404, "Viaje no encontrado")
    _route_access(caller, org_id, route_id)
    return _ok(_detail(route_id, driver=caller.role_name == logic.DRIVER_ROLE))


def _stop_view(g: dict, live: dict, evidences: dict, driver: bool) -> dict:
    sid = str(g["id"])
    metrics = live["by_stop"].get(sid)
    delay = None
    if g["actual_arrival_time"] is not None and g["planned_arrival_time"] is not None:
        gap = logic._aware(g["actual_arrival_time"]) - logic._aware(g["planned_arrival_time"])
        delay = round(gap.total_seconds() / 60)
    stop = {
        "id": sid, "guide_number": g["guide_number"], "sequence": g["sequence_number"],
        "state": logic.guide_state(g["delivery_status"], g["status"]),
        "order_number": g["order_number"], "invoice_number": g["invoice_number"],
        "customer_name": g["customer_name"], "address": g["delivery_address"], "city": g["delivery_city"],
        "lat": _float(g["latitude"]), "lng": _float(g["longitude"]),
        "arrived_at": _iso(g["actual_arrival_time"]), "recipient_name": g["recipient_name"],
        "evidences": evidences.get(sid, []),
        "planned_arrival_at": _iso(g["planned_arrival_time"]),
        "distance_m": metrics["distance_m"] if metrics else None,
        "eta_at": _iso(metrics["eta_at"]) if metrics else None,
        "delay_min": metrics["delay_min"] if metrics else delay,
    }
    if driver:  # la app del chofer necesita contacto y carga para entregar; la web no
        stop.update({"customer_phone": g["customer_phone"], "items": g["total_items"],
                     "weight": _float(g["total_weight"])})
    return stop


def _detail(route_id: str, *, driver: bool = False) -> dict:
    """Detalle de un viaje: paradas con evidencias (solo factura firmada y firma). La app del chofer no
    recibe URLs firmadas de evidencias (no las usa)."""
    now = _now()
    row = _rq(sql.ROUTE_ONE_SQL, [route_id])[0]
    guides = _rq(sql.GUIDES_SQL, [route_id])
    counts = {"total": len(guides),
              "delivered": sum(logic.guide_state(g["delivery_status"], g["status"]) == logic.GUIDE_DELIVERED for g in guides),
              "failed": sum(logic.guide_state(g["delivery_status"], g["status"]) == logic.GUIDE_FAILED for g in guides)}
    evidences: dict[str, list] = {}
    for ev in _rq(sql.EVIDENCES_SQL, [route_id]):
        evidences.setdefault(str(ev["dispatch_guide_id"]), []).append({
            "id": str(ev["id"]), "kind": ev["kind"], "mime_type": ev["mime_type"],
            "captured_at": _iso(ev["captured_at"]),
            "url": None if driver else _signed_get(ev["storage_key"])})
    state = logic.route_state(row["status"])
    position = _coords(row["last_lat"], row["last_lng"])
    origin = _coords(row["origin_lat"], row["origin_lng"])
    live = _live(state, position, guides, now)
    stopped = _stopped([route_id] if state == "active" else [], now).get(route_id, 0)
    data = _viaje(row, counts, live, stopped, now)
    data.update({
        "origin": None if origin is None else {"lat": origin[0], "lng": origin[1], "name": row["origin_name"]},
        "next_stop_id": live["next_stop_id"],
        "departed_at": _iso(row["departed_at"]),
        "stops": [_stop_view(g, live, evidences, driver) for g in guides],
    })
    return data


def get_recorrido(event: dict) -> dict:
    """Replay: rastro completo del viaje (sin mock ni precisión mala), simplificado a ~15 m, máx. 2000 puntos."""
    caller, org_id = _caller(event, "view", driver_ok=True)
    route_id = path_param(event, "id")
    if not logic.is_uuid(route_id):
        raise HttpError(404, "Viaje no encontrado")
    _route_access(caller, org_id, route_id)
    trail = [{"lat": _float(p["latitude"]), "lng": _float(p["longitude"]), "at": _iso(p["recorded_at"])}
             for p in _rq(sql.TRAIL_REPLAY_SQL, [route_id])]
    return _ok({"points": logic.simplify_trail(trail)})


def summary(event: dict) -> dict:
    """DEPRECADO: usar GET /viajes?include=summary. Se mantiene para clientes que aún lo llaman."""
    caller, org_id = _caller(event, "view")
    return _ok(_summary(caller, org_id, query_params(event), _now()))


def list_planificados(event: dict) -> dict:
    caller, org_id = _caller(event, "view")
    allowed = caller.country_filter
    params = [org_id]
    country = ""
    if allowed is not None:
        country = "AND rp.country_id = ANY(%s::uuid[])"
        params.append(list(allowed))
    raw = (query_params(event).get("pais") or "").strip().upper()
    if raw:
        if not _PAIS.match(raw):
            raise HttpError(400, "pais inválido")
        country += " AND rp.country_id IN (SELECT id FROM countries WHERE code = %s)"
        params.append(raw)
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

    try:
        result = pg.run_in_transaction(work)
    except HttpError as err:
        # Dos "iniciar" a la vez para el mismo plan: el índice único ux_routes_plan_trip gana y el otro
        # recupera la ruta ya creada (idempotente, no es un error).
        if getattr(err, "code", None) != UNIQUE_VIOLATION:
            raise
        existing = pg.query(sql.ROUTE_BY_PLAN_TRIP_SQL, [trip_id])
        if not existing:
            raise
        return _ok({"route_id": str(existing[0]["id"]), "created": False}, 200)
    return _ok(result, 201 if result["created"] else 200)


def _ingest(run, org_id: str, valid: list[dict], device_id, now: datetime, mine: str | None) -> dict:
    """Escritura de un lote dentro de UNA transacción: puntos, última posición por viaje y salida de la sede."""
    rejected = []
    routes = {str(r["id"]): r for r in run(sql.ROUTES_FOR_POSITIONS_SQL,
                                           [org_id, sorted({p["route_id"] for p in valid})])}
    if mine is not None:
        # Un viaje ajeno se trata como inexistente: se rechaza el punto y no se escribe nada de él.
        routes = {rid: r for rid, r in routes.items() if str(r["driver_id"] or "") == mine}
    accepted = []
    for pos in valid:
        route = routes.get(pos["route_id"])
        if route is None:
            rejected.append(_rej(pos, "viaje no encontrado"))
        elif not logic.route_accepts(logic.route_state(route["status"]), route["actual_end_time"], now):
            rejected.append(_rej(pos, "viaje no activo"))
        else:
            accepted.append((pos, route))
    if not accepted:
        return {"accepted": 0, "duplicates": 0, "rejected": rejected}

    values, params = [], []
    for pos, route in accepted:
        values.append(sql.POSITION_PLACEHOLDERS)
        params += [org_id, pos["route_id"], route["vehicle_id"], route["driver_id"], device_id,
                   pos["client_id"], pos["latitude"], pos["longitude"], pos["accuracy_m"], pos["speed_mps"],
                   pos["heading_deg"], pos["battery_pct"], pos["is_mock"], pos["recorded_at"]]
    stored = {str(r["client_id"]) for r in run(
        f"INSERT INTO tracking_positions ({sql.POSITION_COLUMNS}) VALUES {', '.join(values)} "
        "ON CONFLICT (client_id) DO NOTHING RETURNING client_id", params)}
    fresh = [(pos, route) for pos, route in accepted if str(pos["client_id"]) in stored]

    # Solo un punto nuevo, fiable y de viaje ACTIVO mueve la última posición (la gracia no la mueve).
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
            last_params += [route_id, org_id, pos["latitude"], pos["longitude"], pos["speed_mps"],
                            pos["heading_deg"], pos["battery_pct"], pos["recorded_at"]]
        run(sql.UPSERT_LAST_POSITIONS_SQL.format(values=", ".join([sql.LAST_POSITION_ROW] * len(newest))),
            last_params)

    # Primera salida de la sede (> 300 m): se fija una sola vez, con la primera posición que la muestra.
    by_route: dict[str, list] = {}
    for pos, route in fresh:
        if route["departed_at"] is None and logic.positions_usable(pos["is_mock"], pos["accuracy_m"]):
            by_route.setdefault(pos["route_id"], []).append(pos)
    for route_id, points in by_route.items():
        route = routes[route_id]
        points.sort(key=lambda p: p["recorded_at"])
        departed = logic.first_departure(points, _coords(route["origin_lat"], route["origin_lng"]))
        if departed is not None:
            run(sql.SET_DEPARTED_SQL, [departed, route_id])
    return {"accepted": len(stored), "duplicates": len(accepted) - len(stored), "rejected": rejected}


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
    if not valid:
        return _ok({"accepted": 0, "duplicates": 0, "rejected": rejected})
    mine = None
    if caller.role_name == logic.DRIVER_ROLE:
        mine = _my_driver(caller)
        if mine is None:
            raise HttpError(403, "Tu usuario no está enlazado a un conductor.")
    device_id = body.get("device_id") if isinstance(body.get("device_id"), str) else None
    result = pg.run_in_transaction(lambda run: _ingest(run, org_id, valid, device_id, now, mine))
    return _ok({"accepted": result["accepted"], "duplicates": result["duplicates"],
                "rejected": rejected + result["rejected"]})


def _guide_access(caller, org_id: str, guide_id: str) -> dict:
    if not logic.is_uuid(guide_id):
        raise HttpError(404, "Parada no encontrada")
    rows = _rq(sql.GUIDE_ROW_SQL, [guide_id])
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
            _event(run, org_id, route_id, guide_id, "geofence_out", "warning",
                   f"Entrega fuera de la geocerca ({distance_m} m): {reason}", caller.app_user_id, lat, lng, when)
        return {"stop_id": guide_id, "state": target, "done": int(counts["done"]), "pending": int(counts["pending"]),
                "distance_m": distance_m}

    return _ok(pg.run_in_transaction(work))


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
        data = _detail(str(row["id"]), driver=True)
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
    "GET /api/v1/tracking/viajes": list_viajes,
    "GET /api/v1/tracking/viajes/{id}": get_viaje,
    "GET /api/v1/tracking/viajes/{id}/recorrido": get_recorrido,
    "GET /api/v1/tracking/planificados": list_planificados,
    "GET /api/v1/tracking/resumen": summary,
    "POST /api/v1/tracking/viajes/{id}/iniciar": start_viaje,
    "POST /api/v1/tracking/posiciones": ingest_positions,
    "POST /api/v1/tracking/paradas/{id}/transicion": transition_stop,
    "POST /api/v1/tracking/paradas/{id}/evidencias/upload-url": evidence_upload_url,
    "POST /api/v1/tracking/paradas/{id}/evidencias": evidence_confirm,
}

_handler = tms_handler(ROUTES)


def _accepts_gzip(event: dict) -> bool:
    headers = event.get("headers") or {}
    value = next((v for k, v in headers.items() if str(k).lower() == "accept-encoding"), "")
    return "gzip" in (value or "").lower()


def _gzip_response(event: dict, response: dict) -> dict:
    """Comprime el cuerpo en base64 (isBase64Encoded, lo decodifica API Gateway HTTP API) si el cliente
    acepta gzip y el cuerpo pasa de GZIP_MIN_BYTES. Sin cambios en tms_common."""
    body = response.get("body")
    if (not _accepts_gzip(event) or not isinstance(body, str) or response.get("isBase64Encoded")
            or len(body.encode("utf-8")) <= GZIP_MIN_BYTES):
        return response
    packed = base64.b64encode(gzip.compress(body.encode("utf-8"), compresslevel=6)).decode("ascii")
    headers = {**(response.get("headers") or {}), "Content-Encoding": "gzip", "Vary": "Accept-Encoding"}
    return {**response, "headers": headers, "body": packed, "isBase64Encoded": True}


def handler(event: dict, context: object) -> dict:
    return _gzip_response(event, _handler(event, context))
