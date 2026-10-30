"""Evidencias de entrega (foto de factura firmada, firma): la app sube DIRECTO a S3 con un formulario firmado de
5 min; aquí solo se firma, se valida y se guarda la fila en `tracking_evidences`.

El bucket es el PROPIO de la app (EVIDENCE_BUCKET, lo crea el stack mobile) y cada archivo queda en la carpeta de su
pedido: `pedidos/<número>/<id del pedido>/<kind>-<uuid>.<ext>`, con el pedido y la parada también como metadatos del
objeto. La fila guarda pedido, número y bucket, así la web del TMS firma la lectura en el bucket correcto."""

import os
from datetime import datetime, timezone

from . import config, db, logic, sql
from .auth import Driver
from .errors import HttpError
from .http import body_dict, ok, path_param
from .stops import guide_access

_s3 = None


def s3():
    global _s3
    if _s3 is None:
        import boto3  # perezoso: los tests y el servidor local sin S3 no lo necesitan
        from botocore.config import Config

        region = os.environ.get("AWS_REGION", "us-east-2")
        _s3 = boto3.client("s3", region_name=region, endpoint_url=f"https://s3.{region}.amazonaws.com",
                           config=Config(signature_version="s3v4", s3={"addressing_style": "virtual"}))
    return _s3


def now() -> datetime:
    return datetime.now(timezone.utc)


def _head(key: str) -> dict | None:
    try:
        return s3().head_object(Bucket=config.evidence_bucket(), Key=key)
    except Exception as err:  # botocore ClientError (sin importar botocore aquí)
        code = getattr(err, "response", {}).get("Error", {}).get("Code")
        if code in ("404", "NoSuchKey", "NotFound"):
            return None
        raise


def object_metadata(guide: dict, kind: str) -> dict:
    """Metadatos del objeto en S3 (la app los reenvía tal cual con el formulario): de qué pedido y parada es."""
    return {"x-amz-meta-pedido": logic.key_segment(guide.get("order_number")),
            "x-amz-meta-pedido-id": str(guide.get("order_id") or ""),
            "x-amz-meta-parada-id": str(guide["id"]), "x-amz-meta-tipo": kind}


def upload_url(event: dict, driver: Driver) -> dict:
    guide_id = path_param(event, "id")
    body = body_dict(event)
    kind, mime = logic.require_evidence_request(body)
    client_id = body.get("client_id")
    if client_id is not None and not logic.is_uuid(client_id):
        raise HttpError(400, "client_id inválido")
    guide = guide_access(driver, guide_id)
    key = logic.new_evidence_key(guide, kind, mime, client_id)
    fields = {"Content-Type": mime, **object_metadata(guide, kind)}
    form = s3().generate_presigned_post(
        config.evidence_bucket(), key, Fields=fields,
        Conditions=[*({name: value} for name, value in fields.items()),
                    ["content-length-range", 1, logic.MAX_EVIDENCE_BYTES]],
        ExpiresIn=logic.URL_TTL_SECONDS)
    return ok({"url": form["url"], "fields": form["fields"], "key": key, "kind": kind,
               "max_bytes": logic.MAX_EVIDENCE_BYTES})


def confirm(event: dict, driver: Driver) -> dict:
    guide_id = path_param(event, "id")
    body = body_dict(event)
    kind, _ = logic.require_evidence_request({"kind": body.get("kind"), "mime_type": "image/jpeg"})
    lat, lng = logic.coords(body)
    guide = guide_access(driver, guide_id)
    route_id = str(guide["route_id"])
    key = logic.require_evidence_key(guide, body.get("key"), kind)
    head = logic.require_uploaded_image(_head(key))
    client_id = body.get("client_id") if logic.is_uuid(body.get("client_id")) else None
    try:
        captured = logic.parse_time(body["captured_at"], "captured_at") if body.get("captured_at") else now()
    except ValueError as err:
        raise HttpError(400, str(err)) from None

    def work(run):
        created = run(sql.INSERT_EVIDENCE_SQL, [driver.organization_id, route_id, guide_id, kind, key,
                                                head["ContentType"], int(head["ContentLength"]), captured, lat, lng,
                                                client_id, driver.app_user_id, guide.get("order_id"),
                                                guide.get("order_number"), config.evidence_bucket_or_none()])
        if kind == "signature":
            run(sql.SET_GUIDE_SIGNATURE_SQL, [key, guide_id])
        elif kind == "photo_invoice":
            run(sql.SET_GUIDE_PHOTO_SQL, [key, guide_id])
        return {"evidence_id": str(created[0]["id"]) if created else None, "duplicate": not created}

    return ok(db.run_in_transaction(work), 201)
