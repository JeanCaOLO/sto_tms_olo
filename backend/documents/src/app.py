"""PDF del contrato del transportista en S3 (/api/v1/carriers/{id}/contract).

Flujo de subida (el PDF va DIRECTO del navegador a S3, no pasa por la Lambda):
  1. POST   .../contract/upload  -> {url, fields, key}: formulario firmado de S3 (5 min, solo PDF ≤ 10 MB)
  2. el navegador hace POST multipart a `url` con `fields` + el archivo (campo `file`, al final)
  3. PUT    .../contract {key}   -> verifica que el PDF llegó y lo deja como contrato vigente
Descarga: GET .../contract -> {url}: enlace firmado de 5 min. Quitar: DELETE .../contract
(el archivo queda en S3: el bucket tiene versionado y sirve de historial).

Permisos: módulo `transportistas` (ver para bajar, editar para subir/quitar) y país del carrier.
"""

import os

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

from tms_common import permissions, pg
from tms_common.errors import HttpError
from tms_common.event import json_body, path_param
from tms_common.handler import tms_handler
from tms_common.responses import json_response

from contract_files import (MAX_PDF_BYTES, PDF_CONTENT_TYPE, URL_TTL_SECONDS, download_name,
                            new_contract_key, require_contract_key, require_uploaded_pdf)

MODULE = "transportistas"
CARRIER_SQL = "SELECT id, code, name, country_id, contract_file_key FROM carriers WHERE id = %s"
SET_CONTRACT_SQL = "UPDATE carriers SET contract_file_key = %s, updated_at = now() WHERE id = %s"

_s3 = None


def s3():
    global _s3
    if _s3 is None:
        # Endpoint regional + firma v4: las URLs firmadas funcionan desde el navegador sin redirecciones.
        region = os.environ.get("AWS_REGION", "us-east-2")
        _s3 = boto3.client("s3", region_name=region, endpoint_url=f"https://s3.{region}.amazonaws.com",
                           config=Config(signature_version="s3v4", s3={"addressing_style": "virtual"}))
    return _s3


def bucket() -> str:
    return os.environ["DOCUMENTS_BUCKET"]


def _carrier(event: dict, action: str) -> dict:
    caller = permissions.for_event(event)
    caller.require(MODULE, action)
    rows = pg.query(CARRIER_SQL, [path_param(event, "id")])
    if not rows:
        raise HttpError(404, "Transportista no encontrado")
    carrier = rows[0]
    allowed = caller.country_filter
    if allowed is not None and carrier.get("country_id") is not None and str(carrier["country_id"]) not in allowed:
        raise HttpError(403, "Tu rol no tiene acceso a ese país.")
    return carrier


def _ok(data: object) -> dict:
    return json_response(200, {"data": data, "error": None})


def upload_form(event: dict) -> dict:
    carrier = _carrier(event, "edit")
    key = new_contract_key(str(carrier["id"]))
    form = s3().generate_presigned_post(
        bucket(), key,
        Fields={"Content-Type": PDF_CONTENT_TYPE},
        Conditions=[{"Content-Type": PDF_CONTENT_TYPE}, ["content-length-range", 1, MAX_PDF_BYTES]],
        ExpiresIn=URL_TTL_SECONDS,
    )
    return _ok({"url": form["url"], "fields": form["fields"], "key": key, "max_bytes": MAX_PDF_BYTES})


def _head(key: str) -> dict | None:
    try:
        return s3().head_object(Bucket=bucket(), Key=key)
    except ClientError as err:
        if err.response.get("Error", {}).get("Code") in ("404", "NoSuchKey", "NotFound"):
            return None
        raise


def save_contract(event: dict) -> dict:
    carrier = _carrier(event, "edit")
    body = json_body(event)
    key = require_contract_key(str(carrier["id"]), body.get("key") if isinstance(body, dict) else None)
    require_uploaded_pdf(_head(key))
    pg.query(SET_CONTRACT_SQL, [key, carrier["id"]])
    return _ok({"contract_file_key": key})


def download_contract(event: dict) -> dict:
    carrier = _carrier(event, "view")
    if not carrier.get("contract_file_key"):
        raise HttpError(404, "El transportista no tiene contrato cargado")
    # La columna también se puede escribir por la API genérica de datos: solo se firma una llave con
    # la forma que genera este backend para ESTE transportista, nunca otro objeto del bucket.
    try:
        key = require_contract_key(carrier["id"], carrier["contract_file_key"])
    except HttpError:
        raise HttpError(404, "El transportista no tiene un contrato válido cargado") from None
    url = s3().generate_presigned_url(
        "get_object",
        Params={"Bucket": bucket(), "Key": key,
                "ResponseContentType": PDF_CONTENT_TYPE,
                "ResponseContentDisposition": f'inline; filename="{download_name(carrier)}"'},
        ExpiresIn=URL_TTL_SECONDS,
    )
    return _ok({"url": url, "expires_in": URL_TTL_SECONDS})


def remove_contract(event: dict) -> dict:
    carrier = _carrier(event, "edit")
    pg.query(SET_CONTRACT_SQL, [None, carrier["id"]])
    return _ok({"contract_file_key": None})


ROUTES = {
    "POST /api/v1/carriers/{id}/contract/upload": upload_form,
    "PUT /api/v1/carriers/{id}/contract": save_contract,
    "GET /api/v1/carriers/{id}/contract": download_contract,
    "DELETE /api/v1/carriers/{id}/contract": remove_contract,
}

handler = tms_handler(ROUTES)
