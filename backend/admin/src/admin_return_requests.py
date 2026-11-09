"""Solicitudes de devolución que crea el propio CLIENTE (/api/v1/solicitudes-devolucion/*).

El rol Cliente (permiso `devoluciones_solicitud`: view para ver las suyas, create para solicitar) registra artículo,
cantidad, motivo, descripción y fotos/videos. La solicitud queda en `pendiente_asignacion`: quién la atiende después
NO está definido (ver .test/devoluciones/pendientes-solicitudes-cliente.md), por eso no toca tbl_returns.

La organización y la empresa salen SIEMPRE del usuario autenticado, nunca del cuerpo de la petición. Los archivos
suben directo a S3 con un formulario firmado; aquí se firma, se valida la llave y se confirma el objeto (tipo/tamaño).
"""

import os
import re
import uuid
from datetime import datetime, timezone

from tms_common import audit, pg, permissions
from tms_common.errors import HttpError
from tms_common.event import json_body
from tms_common.responses import json_response

import admin_media
import admin_return_requests_sql as sql

MODULE = "devoluciones_solicitud"
REASONS = ("no_solicitado", "danado", "cantidad_de_mas", "rechazado", "otro")
MAX_ITEMS = 50
MAX_FILES_PER_ITEM = 5
MAX_QUANTITY = 1_000_000
CODE_LIMIT, NAME_LIMIT, DESCRIPTION_LIMIT = 100, 255, 500
MAX_PHOTO_BYTES = 5 * 1024 * 1024
MAX_VIDEO_BYTES = 50 * 1024 * 1024
FILE_MIME = {"image/jpeg": ("photo", "jpg"), "image/png": ("photo", "png"),
             "video/mp4": ("video", "mp4"), "video/quicktime": ("video", "mov")}
URL_TTL_SECONDS = 300
NUMBER_ATTEMPTS = 3
_ROOT = "solicitudes"
_UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
_s3 = None


def _ok(data: object, status: int = 200) -> dict:
    return json_response(status, {"data": data, "error": None})


def _body(event: dict) -> dict:
    body = json_body(event)
    return body if isinstance(body, dict) else {}


def _caller(event: dict, action: str) -> tuple[permissions.Permissions, str, str]:
    """(permisos, organización, empresa) del usuario. Sin empresa asignada no puede solicitar."""
    caller = permissions.for_event(event)
    caller.require(MODULE, action)
    rows = pg.query(sql.CUSTOMER_SQL, [caller.app_user_id])
    if not rows:
        raise HttpError(401, "No existe app_user para este usuario autenticado.")
    if not rows[0]["customer_id"]:
        raise HttpError(403, "Tu usuario no tiene una empresa asignada; contacta al administrador.")
    return caller, str(rows[0]["organization_id"]), str(rows[0]["customer_id"])


def max_bytes(mime: str) -> int:
    return MAX_PHOTO_BYTES if FILE_MIME[mime][0] == "photo" else MAX_VIDEO_BYTES


def file_prefix(org: str, customer: str) -> str:
    return f"{_ROOT}/{org}/{customer}/"


def new_file_key(org: str, customer: str, mime: str) -> str:
    return f"{file_prefix(org, customer)}{uuid.uuid4()}.{FILE_MIME[mime][1]}"


def require_file_key(org: str, customer: str, key: object) -> str:
    """Solo llaves con la forma que genera `new_file_key` para ESTA empresa."""
    pattern = rf"^{re.escape(file_prefix(org, customer))}[0-9a-f-]{{36}}\.(jpg|png|mp4|mov)$"
    if not isinstance(key, str) or not re.match(pattern, key) or not _UUID.match(key.rsplit("/", 1)[1].split(".")[0]):
        raise HttpError(400, "Llave de archivo inválida.")
    return key


def _text(raw: object, label: str, limit: int, *, required: bool = False) -> str | None:
    value = str(raw or "").strip()
    if required and not value:
        raise HttpError(400, f"{label} es obligatorio.")
    if len(value) > limit:
        raise HttpError(400, f"{label} admite hasta {limit} caracteres.")
    return value or None


def parse_items(body: dict) -> list[dict]:
    """Valida y normaliza los artículos. Lanza HttpError 400 con el motivo."""
    raw = body.get("items")
    if not isinstance(raw, list) or not raw:
        raise HttpError(400, "Agrega al menos un artículo a devolver.")
    if len(raw) > MAX_ITEMS:
        raise HttpError(400, f"Una solicitud admite hasta {MAX_ITEMS} artículos.")
    items = []
    for position, entry in enumerate(raw, start=1):
        if not isinstance(entry, dict):
            raise HttpError(400, f"Artículo {position}: formato inválido.")
        label = f"Artículo {position}"
        quantity = entry.get("quantity")
        if isinstance(quantity, bool) or not isinstance(quantity, int) or not 0 < quantity <= MAX_QUANTITY:
            raise HttpError(400, f"{label}: la cantidad debe ser un entero mayor que 0.")
        reason = entry.get("reason_code")
        if reason not in REASONS:
            raise HttpError(400, f"{label}: motivo inválido.")
        description = _text(entry.get("description"), f"{label}: la descripción", DESCRIPTION_LIMIT)
        if reason == "otro" and not description:
            raise HttpError(400, f"{label}: describe el motivo cuando eliges «Otro».")
        files = entry.get("files") or []
        if not isinstance(files, list) or len(files) > MAX_FILES_PER_ITEM:
            raise HttpError(400, f"{label}: máximo {MAX_FILES_PER_ITEM} archivos.")
        keys = [file.get("key") if isinstance(file, dict) else None for file in files]
        if len(set(keys)) != len(keys):
            raise HttpError(400, f"{label}: archivo repetido.")
        items.append({"line": position,
                      "code": _text(entry.get("product_code"), f"{label}: el código", CODE_LIMIT, required=True),
                      "name": _text(entry.get("product_name"), f"{label}: el nombre", NAME_LIMIT),
                      "quantity": quantity, "reason": reason, "description": description, "keys": keys})
    return items


def _client():
    global _s3
    if _s3 is None:
        import boto3  # perezoso: los tests no lo necesitan
        from botocore.config import Config

        region = os.environ.get("AWS_REGION", "us-east-2")
        _s3 = boto3.client("s3", region_name=region, endpoint_url=f"https://s3.{region}.amazonaws.com",
                           config=Config(signature_version="s3v4", s3={"addressing_style": "virtual"}))
    return _s3


def _bucket() -> str:
    bucket = os.environ.get("MOBILE_EVIDENCE_BUCKET")
    if not bucket:
        raise HttpError(503, "La subida de archivos no está disponible.")
    return bucket


def _head(key: str) -> dict | None:
    try:
        return _client().head_object(Bucket=_bucket(), Key=key)
    except HttpError:
        raise
    except Exception as err:  # botocore ClientError
        if getattr(err, "response", {}).get("Error", {}).get("Code") in ("404", "NoSuchKey", "NotFound"):
            return None
        raise


def upload_url(event: dict) -> dict:
    """Formulario firmado (5 min) para subir UN archivo directo a S3."""
    _, org, customer = _caller(event, "create")
    mime = _body(event).get("mime_type")
    if mime not in FILE_MIME:
        raise HttpError(400, "Solo se aceptan fotos JPG/PNG o videos MP4/MOV.")
    key = new_file_key(org, customer, mime)
    limit = max_bytes(mime)
    form = _client().generate_presigned_post(
        _bucket(), key, Fields={"Content-Type": mime},
        Conditions=[{"Content-Type": mime}, ["content-length-range", 1, limit]], ExpiresIn=URL_TTL_SECONDS)
    return _ok({"url": form["url"], "fields": form["fields"], "key": key, "kind": FILE_MIME[mime][0],
                "max_bytes": limit})


def _uploaded(key: str) -> tuple[str, str, int]:
    """(kind, mime, bytes) del objeto REAL en S3; lo declarado por el cliente no se usa."""
    head = _head(key)
    if head is None:
        raise HttpError(400, "Un archivo no se terminó de subir; vuelve a intentarlo.")
    mime = head.get("ContentType")
    size = int(head.get("ContentLength") or 0)
    if mime not in FILE_MIME or not 0 < size <= max_bytes(mime):
        raise HttpError(400, "Un archivo tiene un tipo o tamaño no permitido (foto hasta 5 MB, video hasta 50 MB).")
    return FILE_MIME[mime][0], mime, size


def _next_number(run, org: str) -> str:
    prefix = f"SOL-{datetime.now(timezone.utc):%Y-%m}-"
    return f"{prefix}{run(sql.NEXT_NUMBER_SQL, [org, prefix])[0]['next']:04d}"


def create_request(event: dict) -> dict:
    caller, org, customer = _caller(event, "create")
    items = parse_items(_body(event))
    stored = {item["line"]: [_uploaded(require_file_key(org, customer, key)) for key in item["keys"]]
              for item in items}
    with pg.transaction() as run:
        created = []
        for _ in range(NUMBER_ATTEMPTS):
            created = run(sql.INSERT_REQUEST_SQL, [org, customer, caller.app_user_id, _next_number(run, org)])
            if created:
                break
        if not created:
            raise HttpError(409, "No se pudo generar el número de la solicitud; inténtalo de nuevo.")
        request_id = created[0]["id"]
        for item in items:
            row = run(sql.INSERT_ITEM_SQL, [request_id, item["line"], item["code"], item["name"], item["quantity"],
                                            item["reason"], item["description"]])
            for key, (kind, mime, size) in zip(item["keys"], stored[item["line"]]):
                run(sql.INSERT_FILE_SQL, [row[0]["id"], key, kind, mime, size])  # unique(s3_key): reuso -> 409
    audit.record(event, "create", module_key=MODULE, entity_table="tbl_return_requests", entity_id=str(request_id),
                 metadata={"request_number": created[0]["request_number"], "items": len(items)})
    return _ok({"id": str(request_id), "request_number": created[0]["request_number"],
                "status": created[0]["status"]}, 201)


def _with_items(requests: list[dict], org: str) -> list[dict]:
    """Agrega a cada solicitud sus artículos y los archivos con URL temporal de lectura. Nunca expone la llave S3."""
    if not requests:
        return requests
    items = pg.query(sql.ITEMS_SQL, [[str(r["id"]) for r in requests]])
    files = pg.query(sql.FILES_SQL, [[str(i["id"]) for i in items]]) if items else []
    files_by_item: dict[str, list[dict]] = {}
    for file in files:
        files_by_item.setdefault(str(file["item_id"]), []).append({
            "kind": file["kind"], "mime_type": file["mime_type"], "size_bytes": file["size_bytes"],
            "url": admin_media.signed_request_file_url(file["s3_key"], org)})
    items_by_request: dict[str, list[dict]] = {}
    for item in items:
        items_by_request.setdefault(str(item["request_id"]), []).append({
            **{key: item[key] for key in ("id", "line_number", "product_code", "product_name", "quantity",
                                           "reason_code", "description")},
            "files": files_by_item.get(str(item["id"]), [])})
    return [{**request, "items": items_by_request.get(str(request["id"]), [])} for request in requests]


def list_mine(event: dict) -> dict:
    """Solicitudes del propio usuario Cliente, con sus fotos y videos."""
    caller, org, customer = _caller(event, "view")
    return _ok(_with_items(pg.query(sql.MINE_SQL, [org, customer, caller.app_user_id]), org))


def list_all(event: dict) -> dict:
    """Solo lectura para el rol Devoluciones: solicitudes de todos los clientes de la organización con sus fotos y
    videos. Requiere el permiso `devoluciones` view (el rol Cliente no lo tiene)."""
    caller = permissions.for_event(event)
    caller.require("devoluciones", "view")
    rows = pg.query(sql.CUSTOMER_SQL, [caller.app_user_id])
    if not rows:
        raise HttpError(401, "No existe app_user para este usuario autenticado.")
    org = str(rows[0]["organization_id"])
    return _ok(_with_items(pg.query(sql.ALL_SQL, [org]), org))
