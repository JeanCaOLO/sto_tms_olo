import json
from datetime import date, datetime, time, timezone
from decimal import Decimal
from typing import Any, Callable
from uuid import UUID


def _iso_utc(value: datetime) -> str:
    # Mismo formato que JSON.stringify(Date) en Node, que es lo que el frontend
    # recibía del Express: timestamps sin zona se interpretan como UTC.
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    utc = value.astimezone(timezone.utc)
    return utc.isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _encoder(decimal_as: Callable[[Decimal], Any]) -> Callable[[Any], Any]:
    def encode(value: Any) -> Any:
        if isinstance(value, Decimal):
            return decimal_as(value)
        if isinstance(value, datetime):
            return _iso_utc(value)
        if isinstance(value, date):
            return f"{value.isoformat()}T00:00:00.000Z"
        if isinstance(value, (UUID, time)):
            return str(value)
        raise TypeError(f"Tipo no serializable: {type(value).__name__}")

    return encode


def json_response(status: int, body: Any, decimal_as: Callable[[Decimal], Any] = str) -> dict:
    """Respuesta API Gateway v2.

    `decimal_as=str` replica node-pg (NUMERIC llega como string, sin perder
    precisión en montos); EFLOW usa `float` porque el driver mssql de Node
    devolvía números.
    """
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(body, default=_encoder(decimal_as)),
    }


def empty_response(status: int = 204) -> dict:
    return {"statusCode": status}
