"""Reglas del PDF del contrato del transportista (sin AWS ni BD: se prueban solas).

El archivo vive en S3 bajo `carriers/<carrier_id>/contract/<uuid>.pdf`. La llave la genera el
backend: el navegador nunca elige dónde escribe, y al guardar se exige que la llave sea de ESE
transportista (no se puede apuntar un carrier al contrato de otro).
"""

import re
import uuid

from tms_common.errors import HttpError

PDF_CONTENT_TYPE = "application/pdf"
MAX_PDF_BYTES = 10 * 1024 * 1024
URL_TTL_SECONDS = 300
_UUID = r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"


def contract_prefix(carrier_id: str) -> str:
    return f"carriers/{carrier_id}/contract/"


def new_contract_key(carrier_id: str) -> str:
    return f"{contract_prefix(carrier_id)}{uuid.uuid4()}.pdf"


def require_contract_key(carrier_id: str, key: object) -> str:
    """La llave que manda el navegador debe ser una que este backend generó para este carrier."""
    text = str(key or "").strip()
    if not re.fullmatch(re.escape(contract_prefix(carrier_id)) + _UUID + r"\.pdf", text):
        raise HttpError(400, "Llave de archivo inválida para este transportista")
    return text


def require_uploaded_pdf(head: dict | None) -> None:
    """`head` = respuesta de head_object (None si el objeto no existe)."""
    if head is None:
        raise HttpError(400, "El archivo no se subió (o la subida aún no terminó)")
    if head.get("ContentType") != PDF_CONTENT_TYPE:
        raise HttpError(400, "El contrato debe ser un PDF")
    if not 0 < int(head.get("ContentLength") or 0) <= MAX_PDF_BYTES:
        raise HttpError(400, "El PDF supera el tamaño permitido (10 MB)")


def download_name(carrier: dict) -> str:
    """Nombre del archivo al descargar: contrato-<código o nombre>.pdf, solo caracteres seguros."""
    base = str(carrier.get("code") or carrier.get("name") or "transportista")
    safe = re.sub(r"[^A-Za-z0-9_-]+", "-", base).strip("-")[:60] or "transportista"
    return f"contrato-{safe}.pdf"
