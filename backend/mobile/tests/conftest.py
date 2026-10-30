"""Fixtures: BD falsa por fragmento de SQL, usuario chofer con token real y constructor de eventos HTTP API."""

import json
import os
import sys
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

import pytest

SRC = Path(__file__).resolve().parent.parent / "src"
sys.path.insert(0, str(SRC))

os.environ.setdefault("JWT_SECRET", "test-secret-no-es-de-produccion-0123456789")
os.environ.setdefault("EVIDENCE_BUCKET", "bucket-de-prueba")

from mobile_api import auth, db, security  # noqa: E402

ORG = "00000000-0000-4000-8000-0000000000aa"
AUTH_USER = "aaaaaaaa-0000-4000-8000-000000000001"
APP_USER = "bbbbbbbb-0000-4000-8000-000000000001"
DRIVER = "88888888-8888-4888-8888-888888888888"
OTHER_DRIVER = "99999999-9999-4999-8999-999999999999"
ROUTE = "11111111-1111-4111-8111-111111111111"
GUIDE = "22222222-2222-4222-8222-222222222222"
TRIP = "33333333-3333-4333-8333-333333333333"
ORDER = "55555555-5555-4555-8555-555555555555"
EMAIL = "chofer@demo.tms.local"
NOW = datetime(2026, 10, 16, 15, 0, tzinfo=timezone.utc)


class Db:
    """pg falso: responde por fragmento de SQL (aplanado) y registra cada sentencia."""

    def __init__(self):
        self.calls, self.answers = [], {}

    def answer(self, fragment, rows):
        self.answers[fragment] = rows

    def run(self, sql, params=()):
        flat = " ".join(sql.split())
        self.calls.append((flat, list(params)))
        for fragment, rows in self.answers.items():
            if fragment in flat:
                return rows(list(params)) if callable(rows) else rows
        return []

    def wrote(self, prefix):
        return [(sql, params) for sql, params in self.calls if sql.startswith(prefix)]


def driver_row(**over):
    base = {"app_user_id": APP_USER, "auth_user_id": AUTH_USER, "organization_id": ORG, "is_active": True,
            "full_name": "Ana Mora", "role_name": "Chofer", "driver_id": DRIVER, "driver_name": "Ana Mora"}
    base.update(over)
    return base


@pytest.fixture
def fake_db(monkeypatch):
    fake = Db()
    monkeypatch.setattr(db, "query", fake.run)
    # La transacción real (con el actor de auditoría) corre sobre la BD falsa.
    @contextmanager
    def transaction():
        yield fake.run

    monkeypatch.setattr(db, "transaction", transaction)
    monkeypatch.setattr(auth, "_contexts", {})                        # caché de contexto limpia por prueba
    fake.answer("FROM app_users u", [driver_row()])
    fake.answer("FROM audit.events", [{"n": 0}])                     # sin fallos de login recientes
    return fake


def access_token(**over) -> str:
    return security.sign_access(over.get("sub", AUTH_USER), EMAIL, over.get("secret", os.environ["JWT_SECRET"]),
                                now=over.get("now"))


def event(route: str, *, path=None, body=None, token="default", headers=None) -> dict:
    hdrs = dict(headers or {})
    if token == "default":
        token = access_token()
    if token:
        hdrs["Authorization"] = f"Bearer {token}"
    return {"routeKey": route, "pathParameters": path, "headers": hdrs,
            "body": json.dumps(body) if body is not None else None, "requestContext": {}}


def body_of(response: dict):
    return json.loads(response["body"])


@pytest.fixture
def call(fake_db):
    """Llama al handler real con token válido. `call(route, path=..., body=...)` → respuesta."""
    from mobile_api import routes

    def _call(route, **kw):
        return routes.handler(event(route, **kw), None)

    return _call
