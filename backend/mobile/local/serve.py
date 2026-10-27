"""Servidor local de desarrollo: ejecuta la Lambda tal cual detrás de un adaptador HTTP que imita API Gateway
(payload 2.0). La app móvil apunta aquí en desarrollo (EXPO_PUBLIC_API_BASE=http://<ip>:4100).

    python local/serve.py            # puerto 4100 (API_PORT para cambiarlo)

Lee `backend/mobile/.env` (ver .env.example). Aurora requiere el túnel SSM abierto.
"""

import json
import logging
import os
import re
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))
sys.path.insert(0, str(ROOT / "local"))

from env import load_env  # noqa: E402

load_env()

from mobile_api import routes  # noqa: E402

# Sin EVIDENCE_BUCKET no hay S3: las evidencias se guardan en local/_evidencias (ver dev_evidence.py).
EVIDENCE_DIR = None
if not os.environ.get("EVIDENCE_BUCKET"):
    import dev_evidence  # noqa: E402

    EVIDENCE_DIR = dev_evidence.install()

DEFAULT_PORT = 4100

# Una Lambda atiende una petición a la vez y `db.py` usa UNA conexión global por contenedor. Este servidor es multihilo,
# así que sin este candado dos peticiones en paralelo mezclan BEGIN/COMMIT en la misma conexión y un error deja la
# transacción abortada para todas ("current transaction is aborted").
_ONE_AT_A_TIME = threading.Lock()


def _route_for(method: str, path: str) -> tuple[str, dict] | None:
    """Casa el método y la ruta con una clave tipo API Gateway (`POST /api/.../paradas/{id}/transicion`)."""
    for key in routes.ROUTES:
        verb, _, template = key.partition(" ")
        if verb != method:
            continue
        pattern = "^" + re.sub(r"\{(\w+)\}", r"(?P<\1>[^/]+)", template) + "$"
        match = re.match(pattern, path)
        if match:
            return key, match.groupdict()
    return None


class Handler(BaseHTTPRequestHandler):
    def _serve(self) -> None:
        parts = urlsplit(self.path)
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b""
        if EVIDENCE_DIR and self.command == "POST" and parts.path == dev_evidence.UPLOAD_PATH:
            return self._reply(*dev_evidence.save_upload(self.headers.get("Content-Type"), raw))
        body = raw.decode("utf-8") if raw else None
        found = _route_for(self.command, parts.path)
        key, params = found if found else (f"{self.command} {parts.path}", None)
        event = {"routeKey": key, "pathParameters": params, "headers": dict(self.headers.items()), "body": body,
                 "requestContext": {"requestId": "local", "http": {"sourceIp": self.client_address[0],
                                                                    "userAgent": self.headers.get("User-Agent")}}}
        with _ONE_AT_A_TIME:
            response = routes.handler(event, None)
        payload = (response.get("body") or "").encode("utf-8")
        self.send_response(response["statusCode"])
        for name, value in (response.get("headers") or {}).items():
            self.send_header(name, value)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def _reply(self, status: int, message: str) -> None:
        payload = message.encode("utf-8")
        self.send_response(status)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    do_GET = do_POST = _serve

    def do_OPTIONS(self) -> None:  # noqa: N802 - preflight CORS (solo web/dev)
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.end_headers()

    def log_message(self, fmt, *args) -> None:  # una línea por request, sin datos del body
        print(f"{self.command} {self.path} -> {args[1] if len(args) > 1 else ''}")


if __name__ == "__main__":
    logging.basicConfig(format="%(levelname)s %(message)s")  # en Lambda lo hace CloudWatch; aquí, para ver los tracebacks
    port = int(os.environ.get("API_PORT") or DEFAULT_PORT)
    print(f"API móvil local en http://0.0.0.0:{port} ({len(routes.ROUTES)} rutas)")
    if EVIDENCE_DIR:
        print(f"Evidencias: almacén LOCAL de desarrollo en {EVIDENCE_DIR} (sin EVIDENCE_BUCKET)")
    ThreadingHTTPServer(("0.0.0.0", port), Handler).serve_forever()
