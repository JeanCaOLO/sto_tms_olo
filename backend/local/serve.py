"""Servidor local que ejecuta las Lambdas de backend/ tal cual, detrás de un
router que imita API Gateway HTTP (payload 2.0) + el Lambda authorizer.

Reemplaza a `npm run server` (Express) para desarrollo: el frontend sigue
usando el proxy de Vite /api -> http://localhost:4000.

    pip install -r backend/requirements-dev.txt
    npm run api:local          # o: python backend/local/serve.py

Lee .env.local / .env de la raíz del repo (TMS_DB_*, JWT_SECRET, EFLOW_*).
Aurora requiere el túnel SSM levantado (docs/guides/tunel-ssm-a-rds.md).
"""

import importlib.util
import json
import os
import re
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

BACKEND = Path(__file__).resolve().parent.parent
REPO = BACKEND.parent
STACKS = {
    "auth": BACKEND / "auth" / "src",
    "data": BACKEND / "data" / "src",
    "context": BACKEND / "context" / "src",
    "eflow": BACKEND / "eflow" / "src",
    "admin": BACKEND / "admin" / "src",
    "planning": BACKEND / "planning" / "src",
}
AUTHORIZER = BACKEND / "common-services" / "src" / "authorizer" / "app.py"
PUBLIC_STACKS = {"eflow"}
PUBLIC_ROUTES = {"POST /api/auth/login"}
DEFAULT_PORT = 4000
# Lambda atiende una request por contenedor y tms_common reutiliza UNA conexión
# por proceso: correr handlers en paralelo intercala lecturas del mismo socket.
HANDLER_LOCK = threading.Lock()


def load_env_files() -> None:
    for name in (".env.local", ".env"):
        path = REPO / name
        if not path.exists():
            continue
        for line in path.read_text(encoding="utf-8").splitlines():
            key, sep, value = line.partition("=")
            if sep and not key.strip().startswith("#"):
                os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))
    os.environ.setdefault("EFLOW_MODE", "mock")


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def build_routes() -> list[tuple[str, re.Pattern, str, object, bool]]:
    sys.path.insert(0, str(BACKEND / "common-services" / "layers" / "tms_common"))
    sys.path[1:1] = [str(src) for src in STACKS.values()]
    routes = []
    for stack, src in STACKS.items():
        app = load_module(f"{stack}_app", src / "app.py")
        for key in app.ROUTES:
            method, path = key.split(" ", 1)
            pattern = re.compile("^" + re.sub(r"\{(\w+)\}", r"(?P<\1>[^/]+)", path) + "$")
            is_public = stack in PUBLIC_STACKS or key in PUBLIC_ROUTES
            routes.append((method, pattern, key, app.handler, is_public))
    return routes


class ApiHandler(BaseHTTPRequestHandler):
    routes: list = []
    authorizer = None

    def _send(self, status: int, body: str = "", headers: dict | None = None) -> None:
        self.send_response(status)
        for name, value in (headers or {"Content-Type": "application/json"}).items():
            self.send_header(name, value)
        self.end_headers()
        if body:
            self.wfile.write(body.encode("utf-8"))

    def _match(self, path: str):
        for method, pattern, key, handler, is_public in self.routes:
            found = pattern.match(path)
            if method == self.command and found:
                return key, handler, is_public, found.groupdict()
        return None

    def _authorize(self, headers: dict) -> dict | None:
        if not headers.get("authorization"):
            self._send(401, json.dumps({"message": "Unauthorized"}))
            return None
        with HANDLER_LOCK:
            result = self.authorizer.handler({"headers": headers}, None)
        if not result["isAuthorized"]:
            self._send(403, json.dumps({"message": "Forbidden"}))
            return None
        return {"lambda": result["context"]}

    def _event(self, key: str, url, params: dict, authorizer: dict | None) -> dict:
        length = int(self.headers.get("content-length") or 0)
        query = {k: ",".join(v) for k, v in parse_qs(url.query, keep_blank_values=True).items()}
        return {
            "routeKey": key, "rawPath": url.path, "pathParameters": params or None,
            "queryStringParameters": query or None,
            "headers": {k.lower(): v for k, v in self.headers.items()},
            "body": self.rfile.read(length).decode("utf-8") if length else None,
            "isBase64Encoded": False, "requestContext": {"authorizer": authorizer} if authorizer else {},
        }

    def _dispatch(self) -> None:
        url = urlsplit(self.path)
        matched = self._match(url.path)
        if matched is None:
            return self._send(404, json.dumps({"message": "Not Found"}))
        key, handler, is_public, params = matched
        authorizer = None
        if not is_public:
            authorizer = self._authorize({k.lower(): v for k, v in self.headers.items()})
            if authorizer is None:
                return None
        event = self._event(key, url, params, authorizer)
        with HANDLER_LOCK:
            response = handler(event, None)
        self._send(response["statusCode"], response.get("body", ""), response.get("headers"))
        return None

    do_GET = do_POST = do_PATCH = do_DELETE = _dispatch


def main() -> None:
    load_env_files()
    ApiHandler.routes = build_routes()
    ApiHandler.authorizer = load_module("authorizer_app", AUTHORIZER)
    port = int(os.environ.get("EFLOW_API_PORT") or DEFAULT_PORT)
    print(f"Lambdas locales en http://localhost:{port} ({len(ApiHandler.routes)} rutas, EFLOW_MODE={os.environ['EFLOW_MODE']})")
    ThreadingHTTPServer(("127.0.0.1", port), ApiHandler).serve_forever()


if __name__ == "__main__":
    main()
