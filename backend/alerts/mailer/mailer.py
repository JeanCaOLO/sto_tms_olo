"""Correo diario de vencimientos (lo dispara EventBridge Scheduler los días hábiles).

Corre FUERA de la VPC (la VPC no tiene NAT ni endpoint de SES): pide las alertas a la Lambda
`digest` (que sí está en la VPC, junto a Aurora) y las manda por SES. Si no hay vencimientos, no
envía nada.

SES en modo sandbox solo entrega a direcciones VERIFICADAS: si un destinatario no lo está, SES
rechaza el envío y aquí se registra el error (la ejecución falla y queda en CloudWatch).
"""

import json
import logging
import os
from datetime import datetime
from zoneinfo import ZoneInfo

import boto3

from email_body import build_email

log = logging.getLogger()
log.setLevel(logging.INFO)

TIME_ZONE = ZoneInfo("America/Costa_Rica")


def _addresses(name: str) -> list[str]:
    return [a.strip() for a in os.environ.get(name, "").split(",") if a.strip()]


def handler(event: dict, context: object) -> dict:
    response = boto3.client("lambda").invoke(FunctionName=os.environ["DIGEST_FUNCTION"], Payload=b"{}")
    payload = json.loads(response["Payload"].read())
    if response.get("FunctionError"):
        raise RuntimeError(f"La Lambda de vencimientos falló: {payload}")
    alerts = payload["alerts"]
    email = build_email(alerts, datetime.now(TIME_ZONE).date(), os.environ.get("APP_URL") or None)
    if email is None:
        log.info("Sin vencimientos: no se envía correo")
        return {"sent": False, "alerts": 0}

    to, cc = _addresses("ALERT_TO"), _addresses("ALERT_CC")
    result = boto3.client("sesv2").send_email(
        FromEmailAddress=os.environ["ALERT_FROM"],
        Destination={"ToAddresses": to, "CcAddresses": cc},
        Content={"Simple": {
            "Subject": {"Data": email["subject"], "Charset": "UTF-8"},
            "Body": {"Text": {"Data": email["text"], "Charset": "UTF-8"},
                     "Html": {"Data": email["html"], "Charset": "UTF-8"}},
        }},
    )
    log.info("Correo de vencimientos enviado: %s alertas a %s (cc %s), MessageId %s",
             len(alerts), to, cc, result.get("MessageId"))
    return {"sent": True, "alerts": len(alerts), "message_id": result.get("MessageId")}
