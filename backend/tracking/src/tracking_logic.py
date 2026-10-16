"""Reglas puras del tracking en vivo (sin BD ni AWS): estados, señal GPS, progreso, validaciones."""

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

GUIDE_PENDING, GUIDE_DELIVERED, GUIDE_FAILED = "pending", "delivered", "failed"
GUIDE_STATUS_TEXT = {GUIDE_PENDING: "Pendiente", GUIDE_DELIVERED: "Entregado", GUIDE_FAILED: "Fallido"}

# Umbrales de señal (blueprint tenant_settings: presence_online_s / presence_stale_s).
ONLINE_SECONDS = 120
STALE_SECONDS = 900

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
