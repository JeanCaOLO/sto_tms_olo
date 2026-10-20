"""Armado y envío del correo por la API de Gmail (users.messages.send)."""

import base64
import re
from email.message import EmailMessage
from email.utils import formataddr

import http_util

SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send"
MAX_PDF_BYTES = 5 * 1024 * 1024  # una Lambda síncrona admite ~6 MB de petición
_EMAIL = re.compile(r"^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$")


class MailError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status


def clean_recipients(values: object) -> list[str]:
    if not isinstance(values, list) or not values:
        raise MailError(400, "Indica al menos un destinatario.")
    cleaned = [str(v).strip() for v in values]
    bad = [v for v in cleaned if not _EMAIL.match(v)]
    if bad:
        raise MailError(400, f"Correo no válido: {', '.join(bad)}")
    return cleaned


def decode_pdf(pdf_base64: object) -> bytes:
    try:
        pdf = base64.b64decode(str(pdf_base64 or ""), validate=True)
    except ValueError as err:
        raise MailError(400, "El PDF adjunto no es válido.") from err
    if not pdf.startswith(b"%PDF"):
        raise MailError(400, "El adjunto no es un PDF.")
    if len(pdf) > MAX_PDF_BYTES:
        raise MailError(413, "El PDF es demasiado grande para enviarlo por correo.")
    return pdf


def build_message(sender: str, to: list[str], subject: str, body: str, pdf: bytes, file_name: str) -> str:
    """Mensaje MIME en base64url, listo para `raw`. El asunto y el cuerpo van en UTF-8."""
    if not subject.strip():
        raise MailError(400, "El asunto no puede estar vacío.")
    message = EmailMessage()
    message["From"] = formataddr(("", sender)) if sender else ""
    message["To"] = ", ".join(to)
    message["Subject"] = subject.replace("\r", " ").replace("\n", " ")
    message.set_content(body)
    safe_name = re.sub(r"[^A-Za-z0-9._-]", "_", file_name) or "proforma.pdf"
    message.add_attachment(pdf, maintype="application", subtype="pdf", filename=safe_name)
    return base64.urlsafe_b64encode(message.as_bytes()).decode("ascii")


def send(access_token: str, raw: str) -> str:
    """Envía y devuelve el id del mensaje en Gmail."""
    try:
        return http_util.post_json(SEND_URL, {"raw": raw}, access_token).get("id", "")
    except http_util.UpstreamError as err:
        raise MailError(502, f"Gmail no aceptó el correo: {err}") from err
