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
STACK_MODULES = {"app", "relations", "schema", "select_parser", "select_query", "mutations",
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
        "app_users": {"id", "full_name", "role_id", "organization_id"},
    }
    yield schema
    schema._columns = None
