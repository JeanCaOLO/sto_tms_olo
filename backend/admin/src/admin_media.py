"""URL firmada de lectura de las fotos que sube la app del chofer (bucket de evidencias del stack mobile).

`tbl_returns.photo_url` guarda la LLAVE S3 (`pedidos/<número>/<id>/<kind>-<uuid>.<ext>`), no una URL. La foto es accesoria:
si falta el bucket, el permiso S3 o S3 falla, la pantalla debe seguir cargando (devuelve None)."""

import logging
import os
import re

SIGNED_GET_TTL_SECONDS = 3600
_KEY = re.compile(r"^pedidos/[A-Za-z0-9_.-]+/[0-9a-f-]{36}/[a-z_]+-[0-9a-f-]{36}\.(jpg|png)$")
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


def signed_photo_url(key) -> str | None:
    """URL temporal para ver la foto de una devolución, o None (sin foto, llave ajena al bucket, sin bucket o S3 caído)."""
    bucket = os.environ.get("MOBILE_EVIDENCE_BUCKET")
    if not bucket or not isinstance(key, str) or not _KEY.match(key):
        return None
    try:
        return _client().generate_presigned_url("get_object", Params={"Bucket": bucket, "Key": key},
                                                ExpiresIn=SIGNED_GET_TTL_SECONDS)
    except Exception:  # noqa: BLE001 - botocore, credenciales
        log.warning("No se pudo firmar la foto %s", key, exc_info=True)
        return None
