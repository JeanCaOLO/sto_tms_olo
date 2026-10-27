"""Presencia del chofer (online/offline) para el módulo de tracking del TMS.

La escriben el login, el logout, el heartbeat de la app y las posiciones. Es de mejor esfuerzo: un fallo aquí se
registra pero nunca tumba el login, el logout ni el lote de posiciones, que son lo que no se puede perder.
"""

import logging
from datetime import datetime, timezone

from . import db, logic, sql
from .errors import HttpError
from .http import body_dict, ok

logger = logging.getLogger()


def now() -> datetime:
    return datetime.now(timezone.utc)


def event_time(raw, at: datetime) -> datetime:
    """Hora del evento en el teléfono (puede venir de la cola offline), acotada a `at`. Sin ella, `at`."""
    if raw is None:
        return at
    try:
        return logic.clamp_to_now(logic.parse_time(raw, "occurred_at"), at)
    except ValueError as err:
        raise HttpError(400, str(err)) from None


def _battery(value) -> int | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not 0 <= value <= 100:
        return None
    return int(value)


def _device(value) -> str | None:
    return value[:100] if isinstance(value, str) and value else None


def mark(driver, status: str, last_event: str, seen_at: datetime, device_id=None, battery_pct=None) -> None:
    """`status` online|offline con `last_event` login|heartbeat (el logout va por `mark_offline`)."""
    try:
        db.query(sql.UPSERT_PRESENCE_SQL, [driver.driver_id, driver.organization_id, status, last_event, seen_at,
                                           _device(device_id), _battery(battery_pct)])
    except Exception:  # noqa: BLE001
        logger.exception("No se pudo registrar la presencia (%s)", last_event)


def touch(driver, seen_at: datetime, device_id=None, battery_pct=None) -> None:
    """Un lote de posiciones prueba que el teléfono está vivo, sin reactivar a quien ya cerró sesión."""
    try:
        db.query(sql.TOUCH_PRESENCE_SQL, [driver.driver_id, driver.organization_id, seen_at, _device(device_id),
                                          _battery(battery_pct)])
    except Exception:  # noqa: BLE001
        logger.exception("No se pudo refrescar la presencia")


def mark_offline(app_user_id: str, seen_at: datetime, device_id=None) -> None:
    try:
        db.query(sql.OFFLINE_BY_USER_SQL, [seen_at, _device(device_id), app_user_id])
    except Exception:  # noqa: BLE001
        logger.exception("No se pudo marcar offline al chofer")


def heartbeat(event: dict, driver) -> dict:
    """POST /presencia/heartbeat. `occurred_at` permite reenviar latidos guardados sin red (no pisan los nuevos)."""
    body = body_dict(event)
    seen = event_time(body.get("occurred_at"), now())
    mark(driver, "online", "heartbeat", seen, body.get("device_id"), body.get("battery_pct"))
    return ok({"status": "online", "seen_at": seen.isoformat()})
