"""Almacén de evidencias SOLO para desarrollo local (no se despliega: vive en `local/`, no en `src/`).

Sin `EVIDENCE_BUCKET` no hay S3 contra el que probar la cámara y la firma. `install()` cambia, en este proceso, dos
piezas de `mobile_api.evidence`:
  - `upload_url`: en vez de una URL prefirmada de S3 devuelve un formulario que apunta a este mismo servidor
    (`POST /api/mobile/v1/_dev/evidencias`), firmado con HMAC y con vencimiento de 5 min, igual que el de S3.
  - `_head`: en vez de `HeadObject` mira el archivo guardado en `local/_evidencias/<key>`.
El resto (`confirm`, validaciones, SQL) es el código real. Con `EVIDENCE_BUCKET` definido esto no se instala.
"""

import hashlib
import hmac
import re
import time
from email.parser import BytesParser
from email.policy import default
from pathlib import Path

from mobile_api import config, evidence, logic, routes
from mobile_api.errors import HttpError
from mobile_api.http import body_dict, ok, path_param
from mobile_api.stops import guide_access

UPLOAD_PATH = f"{routes.PREFIX}/_dev/evidencias"
DEFAULT_DIR = Path(__file__).resolve().parent / "_evidencias"
UPLOAD_URL_KEY = f"POST {routes.PREFIX}/paradas/{{id}}/evidencias/upload-url"
_KEY_RE = re.compile(r"^tracking/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png)$")
_MIME_BY_EXT = {ext: mime for mime, ext in logic.EVIDENCE_MIME.items()}

_directory = DEFAULT_DIR


def _sign(key: str, mime: str, expires: int) -> str:
    message = f"{key}|{mime}|{expires}".encode()
    return hmac.new(config.jwt_secret().encode(), message, hashlib.sha256).hexdigest()


def _header(event: dict, name: str) -> str | None:
    return next((v for k, v in (event.get("headers") or {}).items() if k.lower() == name), None)


def _origin(event: dict) -> str:
    """Dirección por la que el cliente llegó aquí: la de Metro (reenviada en x-forwarded-host) o la propia."""
    host = _header(event, "x-forwarded-host") or _header(event, "host") or "localhost:4100"
    return f"http://{host}"


def upload_url(event: dict, driver) -> dict:
    guide_id = path_param(event, "id")
    body = body_dict(event)
    kind, mime = logic.require_evidence_request(body)
    client_id = body.get("client_id")
    if client_id is not None and not logic.is_uuid(client_id):
        raise HttpError(400, "client_id inválido")
    guide = guide_access(driver, guide_id)
    key = logic.new_evidence_key(str(guide["route_id"]), guide_id, mime, client_id)
    expires = int(time.time()) + logic.URL_TTL_SECONDS
    fields = {"key": key, "Content-Type": mime, "expires": str(expires), "signature": _sign(key, mime, expires)}
    return ok({"url": _origin(event) + UPLOAD_PATH, "fields": fields, "key": key, "kind": kind,
               "max_bytes": logic.MAX_EVIDENCE_BYTES})


def head(key: str) -> dict | None:
    path = _directory / key
    if not _KEY_RE.match(key) or not path.is_file():
        return None
    return {"ContentType": _MIME_BY_EXT.get(path.suffix.lstrip(".")), "ContentLength": path.stat().st_size}


def _parts(content_type: str, body: bytes) -> tuple[dict[str, str], bytes | None]:
    raw = b"MIME-Version: 1.0\r\nContent-Type: " + content_type.encode() + b"\r\n\r\n" + body
    message = BytesParser(policy=default).parsebytes(raw)
    fields: dict[str, str] = {}
    file_bytes = None
    for part in message.iter_parts():
        name = part.get_param("name", header="content-disposition")
        payload = part.get_payload(decode=True) or b""
        if name == "file":
            file_bytes = payload
        elif name:
            fields[name] = payload.decode("utf-8", "replace")
    return fields, file_bytes


def save_upload(content_type: str | None, body: bytes) -> tuple[int, str]:
    """Recibe el POST multipart de la app. (204, "") si se guardó, como S3; si no, (código, motivo)."""
    if not content_type or "multipart/form-data" not in content_type:
        return 400, "Se esperaba multipart/form-data"
    fields, file_bytes = _parts(content_type, body)
    key, mime = fields.get("key", ""), fields.get("Content-Type", "")
    try:
        expires = int(fields.get("expires", "0"))
    except ValueError:
        return 403, "Formulario inválido"
    expected = _sign(key, mime, expires) if key and mime else ""
    if not expected or not hmac.compare_digest(expected, fields.get("signature", "")):
        return 403, "Firma inválida"
    if expires < time.time():
        return 403, "El formulario venció"
    if not _KEY_RE.match(key) or mime not in logic.EVIDENCE_MIME:
        return 400, "Llave o tipo de archivo inválido"
    if file_bytes is None or not 0 < len(file_bytes) <= logic.MAX_EVIDENCE_BYTES:
        return 400, "El archivo falta o supera 5 MB"
    target = _directory / key
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(file_bytes)
    return 204, ""


def install(directory: Path | None = None) -> Path:
    """Activa el almacén local en este proceso. Devuelve la carpeta donde quedan los archivos."""
    global _directory
    _directory = directory or DEFAULT_DIR
    evidence.upload_url = upload_url
    evidence._head = head
    routes.PRIVATE[UPLOAD_URL_KEY] = upload_url
    routes.ROUTES[UPLOAD_URL_KEY] = upload_url
    return _directory
