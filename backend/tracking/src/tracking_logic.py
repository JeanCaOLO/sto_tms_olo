"""Reglas puras del tracking en vivo (sin BD ni AWS): estados, señal GPS, progreso, validaciones."""

import math
import re
import uuid
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from tms_common.errors import HttpError

# Vocabulario canónico que ESCRIBE el módulo (el que ya entienden Liquidaciones, Dashboard y la UI).
ROUTE_PLANNED = "Planificada"
ROUTE_ACTIVE = "En tránsito"
ROUTE_COMPLETED = "Completada"

# Valores que escriben los scripts o pantallas antiguas; solo se normalizan al LEER.
_PLANNED = {"planificada", "planned", "pending", "pendiente"}
_ACTIVE = {"en tránsito", "en transito", "active", "in_progress", "en_ruta", "en ruta"}
_COMPLETED = {"completada", "completed"}
_CANCELLED = {"anulado", "anulada", "cancelled", "cancelada"}

DRIVER_ROLE = "Chofer"   # rol de la app móvil: solo opera SUS viajes (drivers.app_user_id)
GEOFENCE_M = 150         # "Entregado" sin motivo solo a ≤ 150 m del punto de entrega

ACTIVE_STATUS_SQL_VALUES = sorted(_ACTIVE)
COMPLETED_STATUS_SQL_VALUES = sorted(_COMPLETED)

GUIDE_PENDING, GUIDE_DELIVERED, GUIDE_FAILED = "pending", "delivered", "failed"
GUIDE_STATUS_TEXT = {GUIDE_PENDING: "Pendiente", GUIDE_DELIVERED: "Entregado", GUIDE_FAILED: "Fallido"}

# Umbrales de señal (blueprint tenant_settings: presence_online_s / presence_stale_s), ampliados por cobertura móvil irregular.
ONLINE_SECONDS = 300   # zonas con poca cobertura: la app envía lotes cada 30-60 s y puede quedar sin señal minutos
STALE_SECONDS = 1800

MAX_BATCH = 200
MAX_FUTURE_SKEW = timedelta(minutes=5)
GRACE_AFTER_CLOSE = timedelta(hours=2)  # el chofer puede vaciar el lote de posiciones después de cerrar la ruta
ACCURACY_MAX_M = 200                    # precisión peor que esto: se guarda marcada, no mueve la última posición
MAX_EVIDENCE_BYTES = 5 * 1024 * 1024
EVIDENCE_KINDS = ("photo_invoice", "signature")  # solo factura firmada y firma digital
EVIDENCE_MIME = {"image/jpeg": "jpg", "image/png": "png"}
URL_TTL_SECONDS = 300                   # formulario de subida (POST firmado)
SIGNED_GET_TTL_SECONDS = 3600           # URL de lectura de evidencias (estable: se reusa desde caché)
SIGNED_GET_RENEW_SECONDS = 600          # se vuelve a firmar cuando faltan menos de esto
TRAIL_EPSILON_M = 15                    # tolerancia Douglas-Peucker del recorrido
TRAIL_MAX_POINTS = 2000

_UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")


def is_uuid(value) -> bool:
    return isinstance(value, str) and bool(_UUID_RE.match(value.lower()))


def route_state(raw: str | None) -> str:
    """planned | active | completed | cancelled | unknown, sin importar mayúsculas ni vocabulario."""
    value = (raw or "").strip().lower()
    if value in _PLANNED:
        return "planned"
    if value in _ACTIVE:
        return "active"
    if value in _COMPLETED:
        return "completed"
    if value in _CANCELLED:
        return "cancelled"
    return "unknown"


def guide_state(delivery_status: str | None, status: str | None = None) -> str:
    """pending | delivered | failed. `delivery_status` manda; `status` es el respaldo de datos viejos."""
    for raw in (delivery_status, status):
        value = (raw or "").strip().lower()
        if value in ("delivered", "entregado", "completada"):
            return GUIDE_DELIVERED
        if value in ("failed", "fallido"):
            return GUIDE_FAILED
    return GUIDE_PENDING


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def signal(last_position_at: datetime | None, now: datetime, presence_status: str | None = None,
           presence_seen_at: datetime | None = None) -> str:
    """online | stale | offline | none (nunca reportó posición ni presencia).

    Presencia = lo que informa la app del chofer (`driver_presence`: login, latido, logout). Un `offline` explícito
    (logout) más reciente que el último punto manda sobre la antigüedad; un latido `online` más reciente que el
    último punto también cuenta como señal de vida. Sin presencia, solo cuenta la última posición."""
    if (presence_status == "offline" and presence_seen_at is not None
            and (last_position_at is None or _aware(presence_seen_at) >= _aware(last_position_at))):
        return "offline"
    latest = last_position_at
    if presence_status == "online" and presence_seen_at is not None and (
            latest is None or _aware(presence_seen_at) > _aware(latest)):
        latest = presence_seen_at
    if latest is None:
        return "none"
    age = (_aware(now) - _aware(latest)).total_seconds()
    if age <= ONLINE_SECONDS:
        return "online"
    if age <= STALE_SECONDS:
        return "stale"
    return "offline"


def map_color(state: str, signal_value: str) -> str:
    """Color del camión en el mapa: green (activo con señal), amber (señal vieja), gray (sin señal /
    no activo), blue (completado)."""
    if state == "completed":
        return "blue"
    if state != "active":
        return "gray"
    return {"online": "green", "stale": "amber"}.get(signal_value, "gray")


def progress(guide_states: list[str]) -> dict:
    total = len(guide_states)
    delivered = guide_states.count(GUIDE_DELIVERED)
    failed = guide_states.count(GUIDE_FAILED)
    done = delivered + failed
    return {"total": total, "done": done, "delivered": delivered, "failed": failed,
            "percent": round(done * 100 / total) if total else 0}


# --- ETA, retraso, alertas y semáforo ----------------------------------------------------------------
# Mismas constantes que Planificación (src/pages/planificacion/distance-matrix.ts y time-windows.ts) para
# que el retraso compare contra lo que el planificador habría estimado.
SPEED_KMH = 30
DETOUR_FACTOR = 1.35
SERVICE_MIN = 5
DEFAULT_WINDOW_END = (19, 0)

STOPPED_MIN = 20       # alerta "detenido"
STOPPED_RADIUS_M = 75  # movimiento menor a esto = sigue en el mismo sitio
STOPPED_WINDOW_MIN = 60  # ventana de posiciones que se mira hacia atrás: el conteo de "detenido" tope = 60 min
DEPARTURE_RADIUS_M = 300

# SEDES DE PRUEBA (fijas, sin tocar la BD): `stores` CD-CR no tiene coordenadas y las sedes de Venezuela son por
# empresa (customers), no por bodega. Pendiente de definir con Jean dónde se guardan (docs/tracking/pendientes-tunel.md).
# Orden: sede de la empresa del plan > coordenadas de la tienda de origen > sede del país.
CUSTOMER_ORIGINS = {
    "FEBECA": (10.1897571, -67.9507191),
    "SILLACA": (10.1897571, -67.9507191),
    "BEVAL": (10.1789068, -67.9539846),
}
COUNTRY_ORIGINS = {"CR": (9.9967249, -84.2607843)}


def origin_coords(country: str | None, customer_code: str | None, lat, lng) -> tuple[float, float] | None:
    """Punto de salida del viaje: sede de la empresa (fija) > coordenadas de la tienda de origen > sede del país."""
    by_customer = CUSTOMER_ORIGINS.get((customer_code or "").upper())
    if by_customer:
        return by_customer
    if lat is not None and lng is not None:
        return float(lat), float(lng)
    return COUNTRY_ORIGINS.get((country or "").upper())

ALERT_NO_SIGNAL, ALERT_FAILED = "no_signal", "failed"
ALERT_LATE, ALERT_STOPPED = "late", "stopped"


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Distancia en línea recta (km)."""
    rad = math.radians
    d_lat, d_lng = rad(lat2 - lat1), rad(lng2 - lng1)
    h = math.sin(d_lat / 2) ** 2 + math.cos(rad(lat1)) * math.cos(rad(lat2)) * math.sin(d_lng / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(h))


def distance_to_stop_m(lat, lng, stop_lat, stop_lng) -> int | None:
    """Metros en línea recta del dispositivo al punto de entrega; None si falta alguna coordenada."""
    if None in (lat, lng, stop_lat, stop_lng):
        return None
    return round(haversine_km(float(lat), float(lng), float(stop_lat), float(stop_lng)) * 1000)


def drive_minutes(straight_km: float) -> float:
    return straight_km * DETOUR_FACTOR / SPEED_KMH * 60


def _point(item) -> tuple[float, float] | None:
    lat, lng = item.get("lat"), item.get("lng")
    return None if lat is None or lng is None else (float(lat), float(lng))


def plan_schedule(origin: tuple[float, float] | None, stops: list[dict], start: datetime) -> dict:
    """Horas planificadas por parada (en el orden dado) saliendo de `origin` a `start`.

    `stops`: [{"lat","lng"}]. Una parada sin coordenadas no suma recorrido. Devuelve
    {"arrivals": [datetime], "total_km": float (con desvío), "end": datetime}."""
    clock, here, total_km, arrivals = _aware(start), origin, 0.0, []
    for index, stop in enumerate(stops):
        point = _point(stop)
        if point and here:
            km = haversine_km(here[0], here[1], point[0], point[1])
            total_km += km * DETOUR_FACTOR
            clock += timedelta(minutes=drive_minutes(km))
        arrivals.append(clock)
        clock += timedelta(minutes=SERVICE_MIN)
        here = point or here
    end = arrivals[-1] if arrivals else clock
    return {"arrivals": arrivals, "total_km": round(total_km, 2), "end": end}


def window_end(plan_date, window_time) -> datetime:
    """Fin de ventana de entrega: hora del punto de entrega (o 19:00) en la fecha del plan, UTC."""
    hour, minute = (window_time.hour, window_time.minute) if window_time else DEFAULT_WINDOW_END
    return datetime(plan_date.year, plan_date.month, plan_date.day, hour, minute, tzinfo=timezone.utc)


def stop_metrics(position: tuple[float, float] | None, stops: list[dict], now: datetime) -> dict:
    """Distancia, ETA y retraso de las paradas PENDIENTES.

    `stops`: [{"id","state","sequence","lat","lng","planned_arrival": datetime|None}]. El ETA encadena
    las paradas pendientes en orden de secuencia desde la posición actual. Devuelve
    {"by_stop": {id: {...}}, "next_stop_id", "delay_min"} (delay_min = el de la próxima parada)."""
    now = _aware(now)
    pending = sorted((s for s in stops if s["state"] == GUIDE_PENDING), key=lambda s: s["sequence"])
    by_stop, clock, here = {}, now, position
    for stop in pending:
        point = _point(stop)
        distance_m = None
        if point and position:
            distance_m = round(haversine_km(position[0], position[1], point[0], point[1]) * 1000)
        if point and here:
            clock += timedelta(minutes=drive_minutes(haversine_km(here[0], here[1], point[0], point[1])))
        planned = stop.get("planned_arrival")
        delay = None if planned is None else round((clock - _aware(planned)).total_seconds() / 60)
        by_stop[stop["id"]] = {"distance_m": distance_m, "eta_at": clock, "delay_min": delay}
        clock += timedelta(minutes=SERVICE_MIN)
        here = point or here
    next_id = pending[0]["id"] if pending else None
    return {"by_stop": by_stop, "next_stop_id": next_id,
            "delay_min": by_stop[next_id]["delay_min"] if next_id else None}


def is_departed(position: tuple[float, float] | None, origin: tuple[float, float] | None) -> bool:
    """False = "por salir". Sin sede geocodificada, basta con haber reportado posición."""
    if position is None:
        return False
    if origin is None:
        return True
    return haversine_km(*position, *origin) * 1000 > DEPARTURE_RADIUS_M


def first_departure(positions: list[dict], origin: tuple[float, float] | None) -> datetime | None:
    """Hora de la primera posición fuera de la geocerca de la sede (positions en orden cronológico)."""
    for p in positions:
        if is_departed((float(p["latitude"]), float(p["longitude"])), origin):
            return p["recorded_at"]
    return None


def stopped_minutes(positions: list[dict], now: datetime) -> int:
    """Minutos que el camión lleva en el mismo sitio (positions cronológicas; mira hacia atrás desde la última)."""
    if not positions:
        return 0
    last = positions[-1]
    anchor = (float(last["latitude"]), float(last["longitude"]))
    since = last["recorded_at"]
    for p in reversed(positions[:-1]):
        if haversine_km(anchor[0], anchor[1], float(p["latitude"]), float(p["longitude"])) * 1000 > STOPPED_RADIUS_M:
            break
        since = p["recorded_at"]
    return max(0, round((_aware(now) - _aware(since)).total_seconds() / 60))


def stop_inputs(guides: list[dict]) -> list[dict]:
    """Paradas en el formato de `stop_metrics`, desde filas de dispatch_guides (con coordenadas)."""
    return [{"id": str(g["id"]), "state": guide_state(g["delivery_status"], g["status"]),
             "sequence": g["sequence_number"], "lat": g["latitude"], "lng": g["longitude"],
             "planned_arrival": g["planned_arrival_time"]} for g in guides]


def stopped_by_route(rows: list[dict], now: datetime) -> dict[str, int]:
    """Minutos detenidos por ruta. `rows`: route_id, latitude, longitude, recorded_at (cronológicas por ruta)."""
    grouped: dict[str, list[dict]] = {}
    for row in rows:
        grouped.setdefault(str(row["route_id"]), []).append(row)
    return {route: stopped_minutes(points, now) for route, points in grouped.items()}


def stopped_from_since(rows: list[dict], now: datetime) -> dict[str, int]:
    """Minutos detenidos por ruta desde `since` (la BD ya resolvió desde cuándo está en el mismo sitio)."""
    return {str(r["route_id"]): max(0, round((_aware(now) - _aware(r["since"])).total_seconds() / 60))
            for r in rows if r["since"] is not None}


def positions_usable(is_mock: bool, accuracy_m) -> bool:
    """Un punto mock o con precisión > 200 m se guarda pero no cuenta para la posición ni el recorrido."""
    return not is_mock and (accuracy_m is None or float(accuracy_m) <= ACCURACY_MAX_M)


def route_accepts(state: str, ended_at: datetime | None, now: datetime) -> bool:
    """Viaje activo, o cerrado hace menos de GRACE_AFTER_CLOSE (puntos tardíos del chofer)."""
    if state == "active":
        return True
    return state == "completed" and ended_at is not None and _aware(now) - _aware(ended_at) <= GRACE_AFTER_CLOSE


def _to_meters(points: list[dict]) -> list[tuple[float, float]]:
    """Proyección plana local (equirectangular) en metros: basta para tolerancias de decenas de metros."""
    lat0 = sum(float(p["lat"]) for p in points) / len(points)
    kx = 111320 * math.cos(math.radians(lat0))
    return [(float(p["lng"]) * kx, float(p["lat"]) * 110574) for p in points]


def _segment_distance(p, a, b) -> float:
    ax, ay = a
    dx, dy = b[0] - ax, b[1] - ay
    length2 = dx * dx + dy * dy
    t = 0.0 if length2 == 0 else max(0.0, min(1.0, ((p[0] - ax) * dx + (p[1] - ay) * dy) / length2))
    return math.hypot(p[0] - (ax + t * dx), p[1] - (ay + t * dy))


def _douglas_peucker(xy: list[tuple[float, float]], epsilon: float) -> list[int]:
    """Índices que conservan la forma con tolerancia `epsilon` (m). Pila explícita: sin límite de recursión."""
    count = len(xy)
    keep = [False] * count
    keep[0] = keep[-1] = True
    stack = [(0, count - 1)]
    while stack:
        first, last = stack.pop()
        worst, worst_index = -1.0, None
        for index in range(first + 1, last):
            distance = _segment_distance(xy[index], xy[first], xy[last])
            if distance > worst:
                worst, worst_index = distance, index
        if worst_index is not None and worst > epsilon:
            keep[worst_index] = True
            stack.append((first, worst_index))
            stack.append((worst_index, last))
    return [index for index in range(count) if keep[index]]


def simplify_trail(points: list[dict], epsilon_m: float = TRAIL_EPSILON_M, cap: int = TRAIL_MAX_POINTS) -> list[dict]:
    """Recorrido simplificado (Douglas-Peucker). Si aún supera `cap`, sube la tolerancia hasta caber.
    Los extremos siempre se conservan. `points`: dicts con lat, lng (en orden cronológico)."""
    if len(points) <= 2:
        return list(points)
    xy = _to_meters(points)
    epsilon = epsilon_m
    kept = _douglas_peucker(xy, epsilon)
    while len(kept) > cap:
        epsilon *= 1.5
        kept = _douglas_peucker(xy, epsilon)
    return [points[index] for index in kept]


def days_late(due_date, now: datetime, tz: str | None) -> int:
    """Días que el viaje lleva pasado de su fecha de entrega (día calendario en la zona del país); 0 si está en
    plazo. El retraso se mide por DÍA de entrega, no por la hora planificada de cada parada."""
    if due_date is None:
        return 0
    try:
        zone = ZoneInfo(tz) if tz else timezone.utc
    except (ZoneInfoNotFoundError, ValueError):
        zone = timezone.utc
    return max(0, (_aware(now).astimezone(zone).date() - due_date).days)


def alerts(state: str, signal_value: str, failed: int, late_days: int = 0, stopped_min: int = 0,
           position_signal: str | None = None) -> list[dict]:
    """Alertas de un viaje EN TRÁNSITO: [{"code","count"?}]. Para otros estados no hay alertas.

    late: `count` = días pasados de la fecha de entrega.
    no_signal: solo si hubo señal y caducó (signal 'offline'); 'none' (nunca hubo GPS) no alerta.
    stopped: solo con la POSICIÓN reciente (`position_signal`, por defecto `signal_value`): un latido de la app
    no basta para afirmar que el camión está detenido."""
    if state != "active":
        return []
    position_signal = signal_value if position_signal is None else position_signal
    out = []
    if failed:
        out.append({"code": ALERT_FAILED, "count": failed})
    if signal_value == "offline":
        out.append({"code": ALERT_NO_SIGNAL})
    if late_days > 0:
        out.append({"code": ALERT_LATE, "count": late_days})
    if stopped_min >= STOPPED_MIN and position_signal == "online":
        out.append({"code": ALERT_STOPPED, "count": stopped_min})
    return out


def parse_time(raw, label: str = "recorded_at") -> datetime:
    if not isinstance(raw, str):
        raise ValueError(f"{label} inválido")
    try:
        return _aware(datetime.fromisoformat(raw.replace("Z", "+00:00")))
    except ValueError as err:
        raise ValueError(f"{label} inválido") from err


def _number(value, low: float, high: float, label: str, required: bool = False):
    if value is None:
        if required:
            raise ValueError(f"{label} requerido")
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{label} inválido")
    if not low <= value <= high:
        raise ValueError(f"{label} fuera de rango")
    return value


def validate_position(raw, now: datetime) -> dict:
    """Normaliza una posición del lote. Lanza ValueError con el motivo (va en `rejected`)."""
    if not isinstance(raw, dict):
        raise ValueError("posición inválida")
    if not is_uuid(raw.get("client_id")):
        raise ValueError("client_id debe ser un UUID")
    if not is_uuid(raw.get("route_id")):
        raise ValueError("route_id debe ser un UUID")
    recorded = parse_time(raw.get("recorded_at"))
    if recorded > _aware(now) + MAX_FUTURE_SKEW:
        raise ValueError("recorded_at en el futuro")
    battery = _number(raw.get("battery_pct"), 0, 100, "battery_pct")
    return {
        "client_id": raw["client_id"].lower(),
        "route_id": raw["route_id"].lower(),
        "latitude": _number(raw.get("lat"), -90, 90, "lat", required=True),
        "longitude": _number(raw.get("lng"), -180, 180, "lng", required=True),
        "accuracy_m": _number(raw.get("accuracy_m"), 0, 100000, "accuracy_m"),
        "speed_mps": _number(raw.get("speed_mps"), 0, 90, "speed_mps"),
        "heading_deg": _number(raw.get("heading_deg"), 0, 360, "heading_deg"),
        "battery_pct": None if battery is None else int(battery),
        "is_mock": bool(raw.get("is_mock", False)),
        "recorded_at": recorded,
    }


def new_evidence_key(route_id: str, guide_id: str, mime_type: str) -> str:
    return f"tracking/{route_id}/{guide_id}/{uuid.uuid4()}.{EVIDENCE_MIME[mime_type]}"


def require_evidence_request(body) -> tuple[str, str]:
    """(kind, mime_type) validados."""
    body = body if isinstance(body, dict) else {}
    kind, mime = body.get("kind"), body.get("mime_type")
    if kind == "photo_other":  # retirada: el módulo solo guarda factura firmada y firma
        raise HttpError(422, "Las fotos adicionales ya no se aceptan: solo factura firmada y firma.")
    if kind not in EVIDENCE_KINDS:
        raise HttpError(400, f"kind debe ser uno de: {', '.join(EVIDENCE_KINDS)}")
    if mime not in EVIDENCE_MIME:
        raise HttpError(400, "Solo se aceptan imágenes JPG o PNG")
    return kind, mime


def require_evidence_key(route_id: str, guide_id: str, key) -> str:
    """Solo acepta llaves con la forma que genera `new_evidence_key` para ESTA parada."""
    pattern = rf"^tracking/{re.escape(route_id)}/{re.escape(guide_id)}/[0-9a-f-]{{36}}\.(jpg|png)$"
    if not isinstance(key, str) or not re.match(pattern, key):
        raise HttpError(400, "Llave de archivo inválida")
    return key


def require_uploaded_image(head: dict | None) -> dict:
    if head is None:
        raise HttpError(400, "El archivo no se subió a S3")
    if head.get("ContentType") not in EVIDENCE_MIME:
        raise HttpError(400, "El archivo debe ser una imagen JPG o PNG")
    size = int(head.get("ContentLength") or 0)
    if not 0 < size <= MAX_EVIDENCE_BYTES:
        raise HttpError(400, "El archivo supera el tamaño permitido (5 MB)")
    return head


def coords(body: dict) -> tuple[float | None, float | None]:
    """lat/lng opcionales de un body; HttpError 400 si vienen mal."""
    try:
        return (_number(body.get("lat"), -90, 90, "lat"), _number(body.get("lng"), -180, 180, "lng"))
    except ValueError as err:
        raise HttpError(400, str(err)) from None
