"""URL firmada de lectura de las fotos que sube la app del chofer y de las fotos/videos que sube el cliente
(bucket de evidencias del stack mobile).

`tbl_returns.photo_url` guarda la LLAVE S3 (`pedidos/<número>/<id>/<kind>-<uuid>.<ext>`), no una URL; los archivos de
las solicitudes del cliente guardan su llave `solicitudes/<org>/<empresa>/<uuid>.<ext>` en `tbl_return_request_files`.
El archivo es accesorio: si falta el bucket, el permiso S3 o S3 falla, la pantalla debe seguir cargando (devuelve None)."""

import logging
import os
import re

SIGNED_GET_TTL_SECONDS = 3600
_KEY = re.compile(r"^pedidos/[A-Za-z0-9_.-]+/[0-9a-f-]{36}/[a-z_]+-[0-9a-f-]{36}\.(jpg|png)$")
_UUID_PATTERN = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
_UUID = re.compile(rf"^{_UUID_PATTERN}$")
_s3 = None
log = logging.getLogger(__name__)


def _client():
    global _s3
    if _s3 is None:
        import boto3  # perezoso: las pruebas y rutas sin fotos no lo necesitan
        from botocore.config import Config

        region = os.environ.get("AWS_REGION", "us-east-2")
        _s3 = boto3.client("s3", region_name=region, endpoint_url=f"https://s3.{region}.amazonaws.com",
                           config=Config(signature_version="s3v4", s3={"addressing_style": "virtual"}))
    return _s3


def _sign(key: str) -> str | None:
    bucket = os.environ.get("MOBILE_EVIDENCE_BUCKET")
    if not bucket:
        return None
    try:
        return _client().generate_presigned_url("get_object", Params={"Bucket": bucket, "Key": key},
                                                ExpiresIn=SIGNED_GET_TTL_SECONDS)
    except Exception:  # noqa: BLE001 - botocore, credenciales
        log.warning("No se pudo firmar el archivo %s", key, exc_info=True)
        return None


def signed_photo_url(key) -> str | None:
    """URL temporal para ver la foto de una devolución, o None (sin foto, llave ajena al bucket, sin bucket o S3 caído)."""
    if not isinstance(key, str) or not _KEY.match(key):
        return None
    return _sign(key)


def signed_request_file_url(key, organization_id) -> str | None:
    """URL temporal (1 h) para ver una foto o video de una solicitud de devolución del cliente.

    Solo firma llaves `solicitudes/<organización>/<empresa>/<uuid>.(jpg|png|mp4|mov)` de LA organización indicada;
    cualquier otra llave devuelve None. Mismo criterio que la foto del chofer: si falla, la pantalla sigue cargando."""
    if not isinstance(key, str) or not isinstance(organization_id, str) or not _UUID.match(organization_id):
        return None
    if not re.match(rf"^solicitudes/{re.escape(organization_id)}/{_UUID_PATTERN}/{_UUID_PATTERN}\.(jpg|png|mp4|mov)$", key):
        return None
    return _sign(key)
