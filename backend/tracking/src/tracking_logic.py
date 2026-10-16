"""Reglas puras del tracking en vivo (sin BD ni AWS): estados, señal GPS, progreso, validaciones."""

import math
import re
import uuid
from datetime import datetime, timedelta, timezone

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

ACTIVE_STATUS_SQL_VALUES = sorted(_ACTIVE)
COMPLETED_STATUS_SQL_VALUES = sorted(_COMPLETED)

GUIDE_PENDING, GUIDE_DELIVERED, GUIDE_FAILED = "pending", "delivered", "failed"
GUIDE_STATUS_TEXT = {GUIDE_PENDING: "Pendiente", GUIDE_DELIVERED: "Entregado", GUIDE_FAILED: "Fallido"}

# Umbrales de señal (blueprint tenant_settings: presence_online_s / presence_stale_s), ampliados por cobertura móvil irregular.
ONLINE_SECONDS = 300   # zonas con poca cobertura: la app envía lotes cada 30-60 s y puede quedar sin señal minutos
STALE_SECONDS = 1800

MAX_BATCH = 200
MAX_FUTURE_SKEW = timedelta(minutes=5)
MAX_EVIDENCE_BYTES = 5 * 1024 * 1024
EVIDENCE_KINDS = ("photo_invoice", "signature", "photo_other")
EVIDENCE_MIME = {"image/jpeg": "jpg", "image/png": "png"}
URL_TTL_SECONDS = 300

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


def signal(last_position_at: datetime | None, now: datetime) -> str:
    """online | stale | offline | none (nunca reportó posición)."""
    if last_position_at is None:
        return "none"
    age = (_aware(now) - _aware(last_position_at)).total_seconds()
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

LATE_MIN = 15          # alerta "retraso"
VERY_LATE_MIN = 60     # semáforo rojo
STOPPED_MIN = 20       # alerta "detenido"
STOPPED_RADIUS_M = 75  # movimiento menor a esto = sigue en el mismo sitio
DEPARTURE_RADIUS_M = 300

ALERT_INCIDENT, ALERT_NO_SIGNAL, ALERT_FAILED = "incident", "no_signal", "failed"
ALERT_LATE, ALERT_STOPPED = "late", "stopped"


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Distancia en línea recta (km)."""
    rad = math.radians
    d_lat, d_lng = rad(lat2 - lat1), rad(lng2 - lng1)
    h = math.sin(d_lat / 2) ** 2 + math.cos(rad(lat1)) * math.cos(rad(lat2)) * math.sin(d_lng / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(h))


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


def alerts(state: str, signal_value: str, failed: int, incidents: int, delay_min: int | None,
           stopped_min: int = 0) -> list[dict]:
    """Alertas de un viaje EN TRÁNSITO: [{"code","count"?}]. Para otros estados no hay alertas."""
    if state != "active":
        return []
    out = []
    if incidents:
        out.append({"code": ALERT_INCIDENT, "count": incidents})
    if failed:
        out.append({"code": ALERT_FAILED, "count": failed})
    if signal_value in ("offline", "none"):
        out.append({"code": ALERT_NO_SIGNAL})
    if delay_min is not None and delay_min > LATE_MIN:
        out.append({"code": ALERT_LATE, "count": delay_min})
    if stopped_min >= STOPPED_MIN and signal_value == "online":
        out.append({"code": ALERT_STOPPED, "count": stopped_min})
    return out


def review_summary(metrics: dict) -> dict:
    """Semáforo de un viaje COMPLETADO.

    metrics: failed, missing_evidence, incidents, pickups, returns, max_delay_min (cualquiera puede faltar).
    rojo: paradas fallidas, entregas sin factura+firma o retraso > 60 min.
    ámbar: novedades, recolectas, devoluciones o retraso > 15 min. verde: nada de lo anterior."""
    def n(key):
        return int(metrics.get(key) or 0)
    delay = metrics.get("max_delay_min")
    delay = 0 if delay is None else round(float(delay))
    red = [{"code": code, "count": n(code)} for code in ("failed", "missing_evidence") if n(code)]
    if delay > VERY_LATE_MIN:
        red.append({"code": "late", "count": delay})
    amber = [{"code": code, "count": n(code)} for code in ("incidents", "pickups", "returns") if n(code)]
    if LATE_MIN < delay <= VERY_LATE_MIN:
        amber.append({"code": "late", "count": delay})
    color = "red" if red else "amber" if amber else "green"
    return {"color": color, "reasons": red + amber}


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
