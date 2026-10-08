"""Avisos en vivo del TMS: API Gateway WebSocket + disparador HTTP.

Reemplaza en AWS al servidor local `ws-local.mjs`. Es puro TRANSPORTE: no lee
la BD ni manda datos de negocio; solo avisa "entraron pedidos nuevos" y la UI
(hook `use-nuevos-pedidos`) recalcula el conteo real contra el backend.

Eventos que atiende esta única Lambda (fuera de la VPC, no toca Aurora):
- WebSocket `$connect`    → valida el JWT de sesión (`?token=`) y guarda la conexión.
- WebSocket `$disconnect` → borra la conexión.
- WebSocket `$default`    → se ignora (el cliente no manda mensajes).
- HTTP `POST /api/v1/realtime/pedidos-nuevos` (con el authorizer JWT del API
  compartido) → avisa a todas las conexiones. Es el equivalente del `/trigger`
  de `ws-local.mjs`: lo llama quien carga pedidos.

No usa `tms_handler`: su auditoría de escrituras abre conexión a Aurora, y esta
Lambda vive fuera de la VPC.
"""

from __future__ import annotations

import json
import logging
import os
import time
from datetime import datetime, timezone

import boto3
import jwt
from botocore.exceptions import ClientError

from tms_common.config import jwt_secret
from tms_common.tokens import verify_token

logger = logging.getLogger()
logger.setLevel(logging.INFO)

# API Gateway corta toda conexión WebSocket a las 2 h; el TTL limpia las que no
# llegaron a disparar $disconnect.
CONNECTION_TTL_SECONDS = 2 * 60 * 60
TRIGGER_ROUTE = "POST /api/v1/realtime/pedidos-nuevos"

_table = None
_management = None


def _connections():
    global _table
    if _table is None:
        _table = boto3.resource("dynamodb").Table(os.environ["CONNECTIONS_TABLE"])
    return _table


def _management_api():
    global _management
    if _management is None:
        _management = boto3.client("apigatewaymanagementapi", endpoint_url=os.environ["WS_MANAGEMENT_ENDPOINT"])
    return _management


def _http(status: int, body: dict) -> dict:
    return {"statusCode": status, "headers": {"Content-Type": "application/json"}, "body": json.dumps(body)}


# --- WebSocket ------------------------------------------------------------------------

def connect(event: dict) -> dict:
    token = (event.get("queryStringParameters") or {}).get("token") or ""
    try:
        user = verify_token(token, jwt_secret())
    except jwt.InvalidTokenError as err:
        logger.info("Conexión WS rechazada: %s", err)
        return {"statusCode": 401}
    _connections().put_item(Item={
        "connectionId": event["requestContext"]["connectionId"],
        "userId": user["id"],
        "expiresAt": int(time.time()) + CONNECTION_TTL_SECONDS,
    })
    return {"statusCode": 200}


def disconnect(event: dict) -> dict:
    _connections().delete_item(Key={"connectionId": event["requestContext"]["connectionId"]})
    return {"statusCode": 200}


# --- Aviso a todos los clientes -------------------------------------------------------

def _connection_ids() -> list[str]:
    ids, kwargs = [], {"ProjectionExpression": "connectionId"}
    while True:
        page = _connections().scan(**kwargs)
        ids += [item["connectionId"] for item in page.get("Items", [])]
        if "LastEvaluatedKey" not in page:
            return ids
        kwargs["ExclusiveStartKey"] = page["LastEvaluatedKey"]


def broadcast(message: dict) -> int:
    """Manda `message` a cada conexión viva; borra las que ya no existen. Devuelve cuántas lo recibieron."""
    data = json.dumps(message).encode("utf-8")
    delivered = 0
    for connection_id in _connection_ids():
        try:
            _management_api().post_to_connection(ConnectionId=connection_id, Data=data)
            delivered += 1
        except ClientError as err:
            if err.response.get("Error", {}).get("Code") == "GoneException":
                _connections().delete_item(Key={"connectionId": connection_id})
            else:
                # Una conexión que falla no corta el aviso a las demás.
                logger.exception("No se pudo avisar a la conexión %s", connection_id)
    return delivered


def avisar_pedidos_nuevos(_event: dict) -> dict:
    at = datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
    clientes = broadcast({"type": "pedidos-nuevos", "at": at})
    return _http(200, {"data": {"ok": True, "clientes": clientes}, "error": None})


# --- Entrada --------------------------------------------------------------------------

WS_ROUTES = {"$connect": connect, "$disconnect": disconnect}


def handler(event: dict, _context: object) -> dict:
    request = event.get("requestContext") or {}
    try:
        if "connectionId" in request:  # evento WebSocket
            route = WS_ROUTES.get(request.get("routeKey"))
            return route(event) if route else {"statusCode": 200}
        if event.get("routeKey") == TRIGGER_ROUTE:
            return avisar_pedidos_nuevos(event)
        return _http(404, {"data": None, "error": {"message": f"Ruta no soportada: {event.get('routeKey')}"}})
    except Exception:
        logger.exception("Fallo no controlado en realtime (%s)", request.get("routeKey") or event.get("routeKey"))
        return _http(500, {"data": None, "error": {"message": "Error interno del servidor"}})
