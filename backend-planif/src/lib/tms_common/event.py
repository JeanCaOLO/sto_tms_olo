"""Lectura del evento HTTP API (payload 2.0)."""

from __future__ import annotations

import base64
import json
from typing import Any

from lib.tms_common.errors import HttpError


def route_key(event: dict) -> str:
    return event.get("routeKey", "")


def query_params(event: dict) -> dict:
    return event.get("queryStringParameters") or {}


def header(event: dict, name: str) -> str | None:
    """Lee un header (case-insensitive). API Gateway v2 y el runner local los
    entregan en minúsculas, pero normalizamos por si acaso."""
    headers = event.get("headers") or {}
    low = name.lower()
    for k, v in headers.items():
        if k.lower() == low:
            return v
    return None


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


def parse_json_param(raw: str | None, label: str) -> Any:
    """Query param que llega como texto JSON (p.ej. `filters`, `order` de /api/data)."""
    if raw is None:
        return None
    try:
        return json.loads(raw)
    except ValueError as err:
        raise HttpError(400, f'Parámetro "{label}" no es JSON válido') from err


def auth_user(event: dict) -> dict:
    """Usuario que dejó el Lambda authorizer en el contexto de la request."""
    authorizer = event.get("requestContext", {}).get("authorizer") or {}
    claims = authorizer.get("lambda") or {}
    if not claims.get("sub"):
        raise HttpError(401, "no_token")
    return {"id": claims["sub"], "email": claims.get("email") or None}
