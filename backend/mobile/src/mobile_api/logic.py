"""Reglas puras de la app del chofer (sin BD ni AWS): estados, geocerca, ETA/retraso, validaciones.

Las constantes de ETA (línea recta x 1,35 a 30 km/h + 5 min por parada) son las mismas del TMS
(`backend/tracking/src/tracking_logic.py`, referencia) para que chofer y administrador vean el mismo retraso.
"""

import math
import re
import uuid
from datetime import datetime, timedelta, timezone

from .errors import HttpError

# Estados de ruta: el TMS escribe "En tránsito"/"Completada"; los scripts viejos usan otros. Solo se normaliza al LEER.
_PLANNED = {"planificada", "planned", "pending", "pendiente"}
_ACTIVE = {"en tránsito", "en transito", "active", "in_progress", "en_ruta", "en ruta"}
_COMPLETED = {"completada", "completed"}
_CANCELLED = {"anulado", "anulada", "cancelled", "cancelada"}
ACTIVE_STATUS_SQL_VALUES = sorted(_ACTIVE)

GUIDE_PENDING, GUIDE_DELIVERED, GUIDE_FAILED = "pending", "delivered", "failed"
GUIDE_STATUS_TEXT = {GUIDE_PENDING: "Pendiente", GUIDE_DELIVERED: "Entregado", GUIDE_FAILED: "Fallido"}

GEOFENCE_M = 150            # "Entregado" sin motivo solo a ≤ 150 m del punto de entrega
DEPARTURE_RADIUS_M = 300    # el camión "salió" al alejarse más de esto de la sede
ACCURACY_MAX_M = 200        # precisión peor que esto no mueve la última posición ni entra al recorrido
GRACE_AFTER_CLOSE = timedelta(hours=2)   # la web acepta puntos tardíos hasta 2 h después de cerrar el viaje
PLANNED_LOOKBACK_DAYS = 7   # el chofer inicia sus viajes desde la app: un plan no iniciado sigue visible una semana
MAX_BATCH = 200
MAX_FUTURE_SKEW = timedelta(days=1)   # un reloj adelantado se acota a "ahora"; solo lo absurdo se rechaza
PRESENCE_ONLINE_SECONDS = 300         # mismos umbrales que la señal de la web (tracking_logic.py)
PRESENCE_STALE_SECONDS = 1800
MAX_EVIDENCE_BYTES = 5 * 1024 * 1024
EVIDENCE_KINDS = ("photo_invoice", "signature")   # la web solo muestra estas dos (photo_other se rechaza allá)
EVIDENCE_MIME = {"image/jpeg": "jpg", "image/png": "png"}
URL_TTL_SECONDS = 300
SPEED_KMH = 30
DETOUR_FACTOR = 1.35
SERVICE_MIN = 5

_UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")


def is_uuid(value) -> bool:
    return isinstance(value, str) and bool(_UUID_RE.match(value.lower()))


def route_state(raw: str | None) -> str:
    """planned | active | completed | cancelled | unknown, sin importar mayúsculas ni vocabulario."""
    value = (raw or "").strip().lower()
    for name, values in (("planned", _PLANNED), ("active", _ACTIVE), ("completed", _COMPLETED),
                         ("cancelled", _CANCELLED)):
        if value in values:
            return name
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


def aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
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


def stop_metrics(position: tuple[float, float] | None, stops: list[dict], now: datetime) -> dict:
    """Distancia, ETA y retraso de las paradas PENDIENTES.

    `stops`: [{"id","state","sequence","lat","lng","planned_arrival": datetime|None}]. El ETA encadena las
    paradas pendientes en orden de secuencia desde la posición actual. Devuelve
    {"by_stop": {id: {"distance_m","eta_at","delay_min"}}, "next_stop_id", "delay_min"}."""
    now = aware(now)
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
        delay = None if planned is None else round((clock - aware(planned)).total_seconds() / 60)
        by_stop[stop["id"]] = {"distance_m": distance_m, "eta_at": clock, "delay_min": delay}
        clock += timedelta(minutes=SERVICE_MIN)
        here = point or here
    next_id = pending[0]["id"] if pending else None
    return {"by_stop": by_stop, "next_stop_id": next_id,
            "delay_min": by_stop[next_id]["delay_min"] if next_id else None}


def plan_schedule(origin: tuple[float, float] | None, stops: list[dict], start: datetime) -> dict:
    """Horas planificadas por parada (en el orden dado) saliendo de `origin` a `start`; igual que la web.

    `stops`: [{"lat","lng"}]. Una parada sin coordenadas no suma recorrido. Devuelve
    {"arrivals": [datetime], "total_km": float (con desvío), "end": datetime}."""
    clock, here, total_km, arrivals = aware(start), origin, 0.0, []
    for stop in stops:
        point = _point(stop)
        if point and here:
            km = haversine_km(here[0], here[1], point[0], point[1])
            total_km += km * DETOUR_FACTOR
            clock += timedelta(minutes=drive_minutes(km))
        arrivals.append(clock)
        clock += timedelta(minutes=SERVICE_MIN)
        here = point or here
    return {"arrivals": arrivals, "total_km": round(total_km, 2), "end": arrivals[-1] if arrivals else clock}


# SEDES DE PRUEBA (las mismas que la web, `tracking_logic.py`): `stores` CD-CR no tiene coordenadas y las sedes de
# Venezuela son por empresa. Orden: sede de la empresa del plan > coordenadas de la tienda de origen > sede del país.
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


def positions_usable(is_mock: bool, accuracy_m) -> bool:
    """Un punto mock o con precisión > 200 m se guarda pero no cuenta para la posición ni el recorrido (como la web)."""
    return not is_mock and (accuracy_m is None or float(accuracy_m) <= ACCURACY_MAX_M)


def route_accepts(state: str, ended_at: datetime | None, now: datetime) -> bool:
    """Viaje activo, o cerrado hace menos de GRACE_AFTER_CLOSE (puntos tardíos del chofer, como la web)."""
    if state == "active":
        return True
    return state == "completed" and ended_at is not None and aware(now) - aware(ended_at) <= GRACE_AFTER_CLOSE


def parse_time(raw, label: str = "recorded_at") -> datetime:
    if not isinstance(raw, str):
        raise ValueError(f"{label} inválido")
    try:
        return aware(datetime.fromisoformat(raw.replace("Z", "+00:00")))
    except ValueError as err:
        raise ValueError(f"{label} inválido") from err


def clamp_to_now(moment: datetime, now: datetime) -> datetime:
    """Hora del teléfono acotada a la del servidor: un reloj adelantado no hace perder el dato (se guarda "ahora")."""
    if moment > aware(now) + MAX_FUTURE_SKEW:
        raise ValueError("fecha en el futuro")
    return min(moment, aware(now))


def presence_signal(status: str | None, last_seen_at: datetime | None, now: datetime) -> str:
    """online | stale | offline | none. Un `offline` explícito (logout) manda sobre la antigüedad."""
    if last_seen_at is None or status is None:
        return "none"
    if status == "offline":
        return "offline"
    age = (aware(now) - aware(last_seen_at)).total_seconds()
    if age <= PRESENCE_ONLINE_SECONDS:
        return "online"
    return "stale" if age <= PRESENCE_STALE_SECONDS else "offline"


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
    recorded = clamp_to_now(parse_time(raw.get("recorded_at")), now)
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


EVIDENCE_ROOT = "pedidos"


def key_segment(value) -> str:
    """Texto apto para una llave de S3 (y para metadatos ASCII): el número de pedido de EFLOW ya lo es casi siempre."""
    text = re.sub(r"[^A-Za-z0-9_.-]+", "-", str(value or "")).strip("-.")
    return text[:80] or "sin-numero"


def evidence_prefix(guide: dict) -> str:
    """Carpeta del PEDIDO en el bucket de evidencias: `pedidos/<número>/<id del pedido>/`. Una parada sin pedido
    (no debería pasar) va a `pedidos/sin-pedido/<id de la parada>/`."""
    if guide.get("order_id"):
        return f"{EVIDENCE_ROOT}/{key_segment(guide.get('order_number'))}/{str(guide['order_id']).lower()}/"
    return f"{EVIDENCE_ROOT}/sin-pedido/{str(guide['id']).lower()}/"


def new_evidence_key(guide: dict, kind: str, mime_type: str, client_id: str | None = None) -> str:
    """Llave en S3: `pedidos/<número>/<id del pedido>/<kind>-<uuid>.<ext>`. Con el `client_id` del teléfono la llave
    es SIEMPRE la misma: reintentar una subida (timeout, URL vencida) sobrescribe el mismo objeto en vez de dejar uno
    huérfano con otra llave."""
    object_id = client_id.lower() if client_id else uuid.uuid4()
    return f"{evidence_prefix(guide)}{kind}-{object_id}.{EVIDENCE_MIME[mime_type]}"


def require_evidence_request(body) -> tuple[str, str]:
    """(kind, mime_type) validados."""
    body = body if isinstance(body, dict) else {}
    kind, mime = body.get("kind"), body.get("mime_type")
    if kind not in EVIDENCE_KINDS:
        raise HttpError(400, f"kind debe ser uno de: {', '.join(EVIDENCE_KINDS)}")
    if mime not in EVIDENCE_MIME:
        raise HttpError(400, "Solo se aceptan imágenes JPG o PNG")
    return kind, mime


def require_evidence_key(guide: dict, key, kind: str | None = None) -> str:
    """Solo acepta llaves con la forma que genera `new_evidence_key` para el pedido de ESTA parada (y del `kind`
    indicado, si se pide uno)."""
    kinds = re.escape(kind) if kind else "|".join(EVIDENCE_KINDS)
    pattern = rf"^{re.escape(evidence_prefix(guide))}({kinds})-[0-9a-f-]{{36}}\.(jpg|png)$"
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
