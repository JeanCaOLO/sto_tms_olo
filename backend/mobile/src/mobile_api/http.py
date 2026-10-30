"""Lectura del evento HTTP API (payload 2.0) y respuestas. Contrato de respuesta: { data, error }."""

import base64
import json
from datetime import date, datetime, time, timezone
from decimal import Decimal
from typing import Any
from uuid import UUID

from .errors import HttpError


def route_key(event: dict) -> str:
    return event.get("routeKey", "")


def path_param(event: dict, name: str) -> str:
    value = (event.get("pathParameters") or {}).get(name)
    if value is None:
        raise HttpError(400, f'Falta el parámetro de ruta "{name}"')
    return value


def json_body(event: dict) -> Any:
    raw = event.get("body")
    if not raw:
        return {}
    if event.get("isBase64Encoded"):
        raw = base64.b64decode(raw).decode("utf-8")
    try:
        return json.loads(raw)
    except ValueError as err:
        raise HttpError(400, "El body no es JSON válido") from err


def body_dict(event: dict) -> dict:
    body = json_body(event)
    return body if isinstance(body, dict) else {}


def headers(event: dict) -> dict:
    return {str(k).lower(): v for k, v in (event.get("headers") or {}).items()}


def _iso_utc(value: datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _encode(value: Any) -> Any:
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, datetime):
        return _iso_utc(value)
    if isinstance(value, date):
        return f"{value.isoformat()}T00:00:00.000Z"
    if isinstance(value, (UUID, time)):
        return str(value)
    raise TypeError(f"Tipo no serializable: {type(value).__name__}")


def json_response(status: int, body: Any) -> dict:
    return {"statusCode": status, "headers": {"Content-Type": "application/json"},
            "body": json.dumps(body, default=_encode)}


def ok(data: object, status: int = 200) -> dict:
    return json_response(status, {"data": data, "error": None})


def fail(status: int, message: str, code: str | None = None) -> dict:
    return json_response(status, {"data": None, "error": {"message": message, **({"code": code} if code else {})}})
