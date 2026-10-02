"""Runner local del backend de Planificacion hexagonal (copia del repo TMS-Backend).

Traido al monorepo sin tocar `backend/`. Sirve auth + context + data + admin +
eflow + planificacion. Puerto configurable con PLANIF_PORT (default 4000).
Lee `.env.local` / `.env` de la raiz del repo (TMS_DB_*, JWT_SECRET) igual que
`backend/local/serve.py`. SIN secretos hardcodeados. Requiere el tunel a Aurora
en localhost:15432.
"""
import json
import os
import re
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parent
SRC = str(HERE / "src")


def _load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        os.environ.setdefault(key.strip(), val.strip().strip('"').strip("'"))


_load_env_file(REPO_ROOT / ".env.local")
_load_env_file(REPO_ROOT / ".env")

os.environ.setdefault("TMS_DB_HOST", "localhost")
os.environ.setdefault("TMS_DB_PORT", "15432")
os.environ.setdefault("TMS_DB_USER", "tms_app")
os.environ.setdefault("TMS_DB_NAME", "tms_olo")
os.environ.setdefault("JWT_SECRET", "dev-local-jwt-secret-no-prod")
os.environ.setdefault("EFLOW_MODE", "mock")

PORT = int(os.environ.get("PLANIF_PORT") or 4000)

if not os.environ.get("TMS_DB_PASSWORD"):
    print("[backend-planif] Falta TMS_DB_PASSWORD. Ponlo en .env.local de la raiz "
          "del repo (igual que para `pnpm api:local:base`).", flush=True)
    sys.exit(1)

sys.path.insert(0, SRC)

try:
    import pg8000.dbapi  # noqa: F401
except Exception:
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", "pg8000"])

from app import wiring  # noqa: E402
from app.planificacion_service import Contexto  # noqa: E402
from lib.tms_common import pg  # noqa: E402
from lib.tms_common.event import auth_user  # noqa: E402
from lib.tms_common.tokens import verify_token  # noqa: E402
from lib.tms_common.config import jwt_secret  # noqa: E402

ORG = "11111111-1111-1111-1111-111111111111"
DEFAULT_AUTH_USER = "baef4812-d266-467e-b6eb-8a0eabc9c615"  # admin@ologistics.com
WH_COUNTRY = {
    "56ce1ef7-cdc5-4b20-89dc-30362101ab3b": "22222222-2222-2222-2222-222222222221",  # CR
    "c5030ee5-f0ed-45dd-85e3-47828579d394": "fab44511-e356-45f9-b1d1-6daaea2a8d8d",  # VE
}
DEFAULT_WH = "56ce1ef7-cdc5-4b20-89dc-30362101ab3b"

_ctx_cache: dict[str, tuple] = {}


def _appuser_org(auth_user_id: str) -> tuple[str | None, str]:
    if auth_user_id not in _ctx_cache:
        rows = pg.query("SELECT id, organization_id FROM app_users WHERE auth_user_id = %s", [auth_user_id])
        _ctx_cache[auth_user_id] = (
            (str(rows[0]["id"]), str(rows[0]["organization_id"])) if rows else (None, ORG)
        )
    return _ctx_cache[auth_user_id]


def fake_resolve_context(event):
    user = auth_user(event)
    app_user_id, org = _appuser_org(user["id"])
    params = event.get("queryStringParameters") or {}
    body = event.get("_parsed_body") or {}
    hdrs = event.get("headers") or {}
    wh = (params.get("warehouse_id") or params.get("almacen_id") or body.get("warehouse_id")
          or hdrs.get("x-warehouse-id") or DEFAULT_WH)
    customer = params.get("customer_id") or body.get("customer_id") or hdrs.get("x-customer-id") or None
    return Contexto(organization_id=org, warehouse_id=wh, country_id=WH_COUNTRY.get(wh),
                    customer_id=customer, user_id=app_user_id)


wiring.resolve_context = fake_resolve_context

from adapters.inbound.auth_api import handler as auth_handler, ROUTES as AUTH_ROUTES          # noqa: E402
from adapters.inbound.context_api import handler as context_handler, ROUTES as CONTEXT_ROUTES  # noqa: E402
from adapters.inbound.data_api import handler as data_handler, ROUTES as DATA_ROUTES          # noqa: E402
from adapters.inbound.admin_api import handler as admin_handler, ROUTES as ADMIN_ROUTES        # noqa: E402
from adapters.inbound.eflow_api import handler as eflow_handler, ROUTES as EFLOW_ROUTES        # noqa: E402
from adapters.inbound.planificacion_api import handler as planif_handler, ROUTES as PLANIF_ROUTES  # noqa: E402

MODULES = [
    (auth_handler, AUTH_ROUTES), (context_handler, CONTEXT_ROUTES),
    (data_handler, DATA_ROUTES), (admin_handler, ADMIN_ROUTES),
    (eflow_handler, EFLOW_ROUTES), (planif_handler, PLANIF_ROUTES),
]

COMPILED = []
for mod_handler, routes in MODULES:
    for key in routes:
        method, path = key.split(" ", 1)
        names = re.findall(r"\{(\w+)\}", path)
        pattern = "^" + re.sub(r"\{\w+\}", r"([^/]+)", path) + "$"
        COMPILED.append((method, re.compile(pattern), names, key, mod_handler))


def match(method, path):
    for m, rx, names, key, mod_handler in COMPILED:
        if m == method:
            mt = rx.match(path)
            if mt:
                return key, dict(zip(names, mt.groups())), mod_handler
    return None, None, None


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        sys.stderr.write("  planif: %s %s\n" % (self.command, self.path))

    def _handle(self):
        u = urlparse(self.path)
        key, pp, mod_handler = match(self.command, u.path)
        if key is None:
            self.send_response(404); self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*"); self.end_headers()
            self.wfile.write(json.dumps({"data": None, "error": {"message": "no local route: %s %s" % (self.command, u.path)}}).encode()); return
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length).decode("utf-8") if length else ""
        qs = {k: v[0] for k, v in parse_qs(u.query).items()}
        claims = {"sub": DEFAULT_AUTH_USER, "email": "admin@ologistics.com"}
        hdr = self.headers.get("Authorization") or ""
        if hdr.startswith("Bearer "):
            try:
                usr = verify_token(hdr[7:], jwt_secret())
                claims = {"sub": usr["id"], "email": usr.get("email")}
            except Exception:
                pass
        event = {"routeKey": key, "queryStringParameters": qs, "pathParameters": pp,
                 "body": raw or None, "isBase64Encoded": False,
                 "headers": {k.lower(): v for k, v in self.headers.items()},
                 "requestContext": {"authorizer": {"lambda": claims}}}
        try:
            resp = mod_handler(event, None)
        except Exception as e:
            self.send_response(500); self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*"); self.end_headers()
            self.wfile.write(json.dumps({"data": None, "error": {"message": "runner: %s" % e}}).encode()); return
        body = resp.get("body") or "{}"
        self.send_response(resp.get("statusCode", 200))
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body.encode("utf-8"))

    do_GET = _handle
    do_POST = _handle
    do_PUT = _handle

    def do_OPTIONS(self):
        self.send_response(204); self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*"); self.end_headers()


if __name__ == "__main__":
    print("backend-planif (Planificacion) en http://localhost:%d (rutas: %d)" % (PORT, len(COMPILED)), flush=True)
    HTTPServer(("127.0.0.1", PORT), H).serve_forever()
