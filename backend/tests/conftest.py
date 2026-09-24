"""Carga los módulos de cada stack como lo haría Lambda (src/ en sys.path +
Layer tms_common), aislando nombres que se repiten entre stacks (app.py)."""

import importlib
import json
import sys
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parent.parent
LAYER = BACKEND / "common-services" / "layers" / "tms_common"
STACK_SOURCES = {
    "authorizer": BACKEND / "common-services" / "src" / "authorizer",
    "auth": BACKEND / "auth" / "src",
    "data": BACKEND / "data" / "src",
    "context": BACKEND / "context" / "src",
    "eflow": BACKEND / "eflow" / "src",
    "admin": BACKEND / "admin" / "src",
    "planning": BACKEND / "planning" / "src",
}
STACK_MODULES = {"app", "table_modules", "admin_permissions", "relations", "schema", "select_parser", "select_query", "mutations",
                 "scopes", "context_queries", "eflow_queries", "live_source", "mock_source",
                 "admin_access", "admin_payload", "admin_sql", "admin_users", "admin_roles", "planning_sql", "delivery_points", "delivery_points_sql"}

sys.path.insert(0, str(LAYER))

_loaded_stack: str | None = None


def load_stack_module(stack: str, module: str = "app"):
    global _loaded_stack
    if stack != _loaded_stack:
        for name in STACK_MODULES:
            sys.modules.pop(name, None)
        _loaded_stack = stack
    source = str(STACK_SOURCES[stack])
    sys.path.insert(0, source)
    try:
        return importlib.import_module(module)
    finally:
        sys.path.remove(source)


def http_event(route_key: str, *, path=None, query=None, body=None, user=None) -> dict:
    event = {
        "routeKey": route_key,
        "pathParameters": path,
        "queryStringParameters": query,
        "body": json.dumps(body) if body is not None else None,
        "requestContext": {},
    }
    if user:
        event["requestContext"]["authorizer"] = {"lambda": {"sub": user["id"], "email": user["email"]}}
    return event


def body_of(response: dict):
    return json.loads(response["body"])


@pytest.fixture
def fake_columns():
    """Esquema mínimo para no depender de information_schema."""
    schema = load_stack_module("data", "schema")
    schema._columns = {
        "drivers": {"id", "name", "carrier_id", "status", "license_type_id"},
        "carriers": {"id", "name", "country_id"},
        "countries": {"id", "name"},
        "roles": {"id", "name"},
        "app_users": {"id", "full_name", "role_id", "organization_id", "auth_user_id"},
        "orders": {"id", "status"},
    }
    yield schema
    schema._columns = None


def make_permissions(modules=None, *, is_admin=False, countries=None):
    """Permisos de prueba. countries=None → todos los países; tupla → solo esos."""
    from tms_common.permissions import ACTIONS, Permissions
    grants = {key: frozenset(ACTIONS if actions == "*" else actions) for key, actions in (modules or {}).items()}
    return Permissions("app-user", "role-1", "Admin" if is_admin else "Operaciones", is_admin, grants,
                       countries is None, tuple(countries or ()))


@pytest.fixture(autouse=True)
def caller_permissions(monkeypatch):
    """Por defecto quien llama es administrador; un test lo cambia con .set(...)."""
    from tms_common import permissions

    class Holder:
        value = make_permissions(is_admin=True)

        def set(self, value):
            self.value = value

    holder = Holder()
    monkeypatch.setattr(permissions, "for_event", lambda event: holder.value)
    return holder

