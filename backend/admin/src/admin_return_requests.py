"""Cliente captura recolectas; Devoluciones revisa solicitudes con alcance operativo.

La decision comercial no planifica transporte ni recibe mercancia. Requiere SQL 67.
Organizacion, autor y empresa provienen del usuario autenticado, nunca del payload.
"""

import os
import re
import uuid
from datetime import datetime, timezone

from tms_common import audit, pg, permissions
from tms_common.errors import HttpError
from tms_common.event import json_body, path_param, query_params
from tms_common.responses import json_response

import admin_return_requests_sql as sql
import admin_return_request_access as access

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
    return access.client(event, action)


def max_bytes(mime: str) -> int:
    return MAX_PHOTO_BYTES if FILE_MIME[mime][0] == "photo" else MAX_VIDEO_BYTES


def file_prefix(org: str, customer: str, user: str) -> str:
    return f"{_ROOT}/{org}/{customer}/{user}/"


def new_file_key(org: str, customer: str, user: str, mime: str) -> str:
    return f"{file_prefix(org, customer, user)}{uuid.uuid4()}.{FILE_MIME[mime][1]}"


def require_file_key(org: str, customer: str, user: str, key: object) -> str:
    """Solo llaves con la forma que genera `new_file_key` para ESTA empresa."""
    pattern = rf"{re.escape(file_prefix(org, customer, user))}[0-9a-f-]{{36}}\.(jpg|png|mp4|mov)"
    if not isinstance(key, str) or not re.fullmatch(pattern, key) or not _UUID.fullmatch(key.rsplit("/", 1)[1].split(".")[0]):
        raise HttpError(400, "Llave de archivo inválida.")
    return key


def _text(raw: object, label: str, limit: int, *, required: bool = False) -> str | None:
    if raw is not None and not isinstance(raw, str):
        raise HttpError(400, f"{label} debe ser texto.")
    value = (raw or "").strip()
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
        files = entry.get("files", [])
        if files is None:
            files = []
        if not isinstance(files, list) or len(files) > MAX_FILES_PER_ITEM:
            raise HttpError(400, f"{label}: máximo {MAX_FILES_PER_ITEM} archivos.")
        keys = [file.get("key") if isinstance(file, dict) else None for file in files]
        if any(not isinstance(key, str) for key in keys):
            raise HttpError(400, f"{label}: llave de archivo invalida.")
        if len(set(keys)) != len(keys):
            raise HttpError(400, f"{label}: archivo repetido.")
        items.append({"line": position,
                      "code": _text(entry.get("product_code"), f"{label}: el código", CODE_LIMIT, required=True),
                      "name": _text(entry.get("product_name"), f"{label}: el nombre", NAME_LIMIT, required=True),
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
    bucket = _bucket()
    try:
        return _client().head_object(Bucket=bucket, Key=key)
    except HttpError:
        raise
    except Exception as err:  # botocore ClientError
        if getattr(err, "response", {}).get("Error", {}).get("Code") in ("404", "NoSuchKey", "NotFound"):
            return None
        raise


def upload_url(event: dict) -> dict:
    """Formulario firmado (5 min) para subir UN archivo directo a S3."""
    caller, org, customer = _caller(event, "create")
    mime = _body(event).get("mime_type")
    if not isinstance(mime, str) or mime not in FILE_MIME:
        raise HttpError(400, "Solo se aceptan fotos JPG/PNG o videos MP4/MOV.")
    bucket = _bucket()
    key = new_file_key(org, customer, caller.app_user_id, mime)
    limit = max_bytes(mime)
    form = _client().generate_presigned_post(
        bucket, key, Fields={"Content-Type": mime},
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
    body = _body(event)
    items = parse_items(body)
    for item in items:
        for key in item['keys']:
            require_file_key(org, customer, caller.app_user_id, key)
    token = body.get('idempotency_key')
    if token is not None and (not isinstance(token, str) or not _UUID.fullmatch(token)):
        raise HttpError(400, 'idempotency_key debe ser un UUID en minusculas.')
    stable_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f'return-request:{org}:{caller.app_user_id}:{token}')) if token else None
    # Reintentos ya confirmados no dependen de que S3 siga disponible.
    if stable_id:
        previous = pg.query(sql.IDEMPOTENT_SQL, [stable_id, org, customer, caller.app_user_id])
        if previous:
            _require_same_payload(pg.query, previous[0], items)
            return _created(previous[0], 200)
    stored = {item['line']: [_uploaded(key) for key in item['keys']] for item in items}
    with pg.transaction() as run:
        run(sql.CREATE_LOCK_SQL, [f'return-requests:{org}'])
        if stable_id:
            previous = run(sql.IDEMPOTENT_SQL, [stable_id, org, customer, caller.app_user_id])
            if previous:
                _require_same_payload(run, previous[0], items)
                return _created(previous[0], 200)
        created = []
        for _ in range(NUMBER_ATTEMPTS):
            params = [org, customer, caller.app_user_id, _next_number(run, org)]
            created = run(sql.INSERT_IDEMPOTENT_SQL, [stable_id, *params]) if stable_id else run(sql.INSERT_REQUEST_SQL, params)
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
    return _created(created[0], 201)


def _created(row, status):
    return _ok({key: str(row[key]) for key in ('id', 'request_number', 'status')}, status)


def _require_same_payload(run, request, incoming):
    files = run(sql.FILES_SQL, [request['id']])
    saved = [{"line": row['line_number'], 'code': row['product_code'], 'name': row['product_name'],
              'quantity': row['quantity'], 'reason': row['reason_code'], 'description': row['description'],
              'keys': sorted(f['s3_key'] for f in files if f['item_id'] == row['id'])}
             for row in run(sql.ITEMS_SQL, [request['id']])]
    normalized = [{**item, 'keys': sorted(item['keys'])} for item in incoming]
    if saved != normalized:
        raise HttpError(409, 'La clave idempotente ya se uso con otro contenido.')


def list_mine(event: dict) -> dict:
    caller, org, customer = _caller(event, "view")
    return _ok(pg.query(sql.MINE_SQL, [org, customer, caller.app_user_id]))


def get_assignment(event):
    """Solo la empresa asignada al propio usuario; sin catalogo ni selector."""
    _, row = access.client_context(event, None)
    return _ok({'id': str(row['customer_id']), 'name': row['customer_name']})


def _uuid_param(value, label):
    if not isinstance(value, str) or not _UUID.fullmatch(value.lower()):
        raise HttpError(400, f'{label} debe ser un UUID valido.')
    return value.lower()


def _request(event, run, scope, *, lock=False):
    request_id = _uuid_param(path_param(event, 'requestId'), 'requestId')
    statement, params = scope
    rows = run(sql.DETAIL_SQL.format(source=sql.REQUEST_FROM_SQL, access=statement,
                                    lock='FOR UPDATE OF r' if lock else ''), [request_id, *params])
    if not rows:
        raise HttpError(404, 'Solicitud no encontrada.')
    return rows[0]


def get_request(event):
    request = _request(event, pg.query, access.read_filter(event))
    items = pg.query(sql.ITEMS_SQL, [request['id']])
    files = pg.query(sql.FILES_SQL, [request['id']])
    return _ok({'request': request, 'items': [{**item, 'files': [
        {k: v for k,v in f.items() if k not in ('s3_key', 'item_id')} for f in files if f['item_id'] == item['id']
    ]} for item in items]})


def _page_number(raw, label, minimum, maximum):
    if not isinstance(raw, str) or not re.fullmatch(r'[0-9]{1,9}', raw) or not minimum <= int(raw) <= maximum:
        raise HttpError(400, f'{label} debe ser un entero entre {minimum} y {maximum}.')
    return int(raw)


def list_inbox(event):
    caller, org = access.operator(event, 'view')
    scope, values = access.operator_filter(caller, org)
    params = query_params(event)
    scope_values = list(values)
    country_filters, country_values = '', []
    if params.get('pais'):
        country_filters = ' AND COALESCE(c.country_id,w.country_id) = %s::uuid'
        country_values = [_uuid_param(params['pais'], 'pais')]
    limit = _page_number(params.get('limit', '25'), 'limit', 1, 100)
    offset = _page_number(params.get('offset', '0'), 'offset', 0, 1_000_000)
    filters = ''
    if params.get('estado'):
        if params['estado'] not in ('pendiente_asignacion', 'aprobada', 'rechazada'):
            raise HttpError(400, 'Estado de solicitud invalido.')
        filters += ' AND r.status = %s'
        values.append(params['estado'])
    if params.get('empresa'):
        filters += ' AND r.customer_id = %s'
        values.append(_uuid_param(params['empresa'], 'empresa'))
    filters += country_filters
    values.extend(country_values)
    rows = pg.query(sql.INBOX_SQL.format(source=sql.REQUEST_FROM_SQL, access=scope, filters=filters),
                    [*values, limit + 1, offset])
    companies = pg.query(sql.INBOX_COMPANIES_SQL.format(source=sql.REQUEST_FROM_SQL, access=scope,
                          filters=country_filters), [*scope_values, *country_values])
    return _ok({'items': rows[:limit], 'companies': companies, 'limit': limit, 'offset': offset, 'has_more': len(rows) > limit})


def _decide(event, target):
    caller, org = access.operator(event, 'edit')
    reason = _text(_body(event).get('reason'), 'El motivo de rechazo', 500, required=True) if target == 'rechazada' else None
    with pg.transaction() as run:
        request = _request(event, run, access.operator_filter(caller, org), lock=True)
        if request['status'] == target and request['rejection_reason'] == reason:
            return _ok(request)
        if request['status'] != 'pendiente_asignacion':
            raise HttpError(409, 'La solicitud ya tiene otra decision comercial.')
        updated = run(sql.DECIDE_SQL, [target, caller.app_user_id, reason, request['id'], org])
        if not updated:
            raise HttpError(409, 'La solicitud cambio de estado; recarga e intentalo de nuevo.')
        audit.record(event, 'update', module_key=access.OPERATOR_MODULE, entity_table='tbl_return_requests',
                     entity_id=str(request['id']), metadata={'action': target, 'reason': reason})
    return _ok(updated[0])


def approve_request(event):
    return _decide(event, 'aprobada')


def reject_request(event):
    return _decide(event, 'rechazada')


def file_url(event):
    request = _request(event, pg.query, access.read_filter(event))
    file_id = _uuid_param(path_param(event, 'fileId'), 'fileId')
    files = pg.query(sql.FILES_SQL, [request['id']])
    file = next((f for f in files if str(f['id']) == file_id), None)
    if file is None:
        raise HttpError(404, 'Archivo no encontrado.')
    # Acepta archivos historicos por su relacion persistida, sin aceptar una llave enviada por URL.
    prefix = f"{_ROOT}/{request['organization_id']}/{request['customer_id']}/"
    key = file['s3_key']
    if not key.startswith(prefix) or '..' in key.split('/'):
        raise HttpError(404, 'Archivo no encontrado.')
    bucket = _bucket()
    url = _client().generate_presigned_url('get_object', Params={'Bucket': bucket, 'Key': key}, ExpiresIn=URL_TTL_SECONDS)
    return _ok({'url': url, 'kind': file['kind'], 'mime_type': file['mime_type'], 'expires_in': URL_TTL_SECONDS})
