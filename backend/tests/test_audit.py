"""Bitácora de auditoría (sql/16): actor por request, eventos de sesión y de
navegador, y consulta con filtros."""

import json

import pytest

from conftest import body_of, http_event, load_stack_module, make_permissions
from tms_common import audit, pg
from tms_common.errors import HttpError
from tms_common.handler import tms_handler

USER = {"id": "11111111-2222-3333-4444-555555555555", "email": "ops@ologistics.com"}
# Hash de bcryptjs para "secreto123" (mismo que test_auth.py).
BCRYPTJS_HASH_FOR_AUDIT = "$2b$10$PZW41BhX61L9M22yjRmf6O/i017qXqIPm4Xi3aeaMooAwqHTkLqgu"


def _event(route, **kw):
    event = http_event(route, user=USER, **kw)
    event["requestContext"].update({"requestId": "req-9", "http": {"sourceIp": "10.0.0.1", "userAgent": "UA"}})
    return event


# --- actor por request --------------------------------------------------------------

def test_write_routes_bind_the_actor_and_always_clear_it(audit_calls):
    def boom(event):
        raise HttpError(409, "choque")
    handler = tms_handler({"POST /x": lambda e: {"statusCode": 200}, "PATCH /x": boom, "GET /x": lambda e: {}})
    handler(_event("POST /x"), None)
    handler(_event("PATCH /x"), None)
    handler(_event("GET /x"), None)
    assert audit_calls == [("bind", "POST /x"), ("clear",), ("bind", "PATCH /x"), ("clear",)]


def test_actor_carries_user_request_ip_and_source(monkeypatch, audit_calls):
    calls = []
    monkeypatch.setattr(pg, "query", lambda sql, params=(): calls.append((sql, params)) or [])
    monkeypatch.setenv("AWS_LAMBDA_FUNCTION_NAME", "tms-data")
    audit_calls.real["bind"](_event("POST /api/data/{table}"))
    audit_calls.real["clear"]()
    assert calls[0][0] == audit.SET_ACTOR_SQL
    assert json.loads(calls[0][1][0]) == {"type": "user", "auth_user_id": USER["id"], "email": USER["email"],
                                          "source": "tms-data POST /api/data/{table}", "request_id": "req-9",
                                          "ip": "10.0.0.1", "user_agent": "UA"}
    assert calls[1][1] == [""]


def test_record_inserts_the_event(monkeypatch, audit_calls):
    calls = []
    monkeypatch.setattr(pg, "query", lambda sql, params=(): calls.append((sql, params)) or [])
    audit_calls.real["record"](_event("POST /api/v1/audit/events"), "export", module_key="clientes",
                               metadata={"rows": 12})
    sql, params = calls[0]
    assert "INSERT INTO audit.events" in sql
    assert params == ["user", USER["email"], "api-local POST /api/v1/audit/events", "export", "clientes", None,
                      None, "req-9", "10.0.0.1", "UA", '{"rows": 12}', USER["id"]]


# --- sesión ---------------------------------------------------------------------------

@pytest.fixture
def auth_app(monkeypatch):
    monkeypatch.delenv("JWT_SECRET_NAME", raising=False)
    monkeypatch.setenv("JWT_SECRET", "test-secret")
    state = {"rows": []}
    monkeypatch.setattr(pg, "query", lambda sql, params=(): state["rows"])
    return load_stack_module("auth"), state


def _login(app, password):
    return app.handler(http_event("POST /api/auth/login", body={"email": "Ops@OLOgistics.com", "password": password}),
                       None)


def test_login_records_success_failure_and_blocked(auth_app, audit_calls):
    app, state = auth_app
    credential = {"auth_user_id": USER["id"], "email": USER["email"], "password_hash": BCRYPTJS_HASH_FOR_AUDIT}
    state["rows"] = []
    assert _login(app, "secreto123")["statusCode"] == 401
    state["rows"] = [{**credential, "is_active": False}]
    assert _login(app, "secreto123")["statusCode"] == 403
    state["rows"] = [{**credential, "is_active": True}]
    assert _login(app, "secreto123")["statusCode"] == 200
    records = [(c[1], c[2].get("email"), c[2].get("auth_user_id")) for c in audit_calls if c[0] == "record"]
    assert records == [("login_failed", "ops@ologistics.com", None),
                       ("login_blocked", "ops@ologistics.com", USER["id"]),
                       ("login", USER["email"], USER["id"])]


def test_logout_is_recorded_for_the_signed_user(auth_app, audit_calls):
    app, _ = auth_app
    assert app.handler(http_event("POST /api/auth/logout", user=USER), None)["statusCode"] == 204
    assert ("record", "logout", {}) in audit_calls


# --- consulta y eventos del navegador --------------------------------------------------

@pytest.fixture
def admin_app(monkeypatch):
    calls = []
    state = {"rows": [], "module_exists": True}

    def fake_query(sql, params=()):
        calls.append((sql, list(params)))
        if sql == "SELECT 1 FROM app_modules WHERE key = %s":
            return [{"?": 1}] if state["module_exists"] else []
        return state["rows"]

    monkeypatch.setattr(pg, "query", fake_query)
    return load_stack_module("admin"), calls, state


def test_list_needs_auditoria_view(admin_app, caller_permissions):
    app, calls, _ = admin_app
    caller_permissions.set(make_permissions({"clientes": "*"}))
    assert app.handler(_event("GET /api/v1/admin/audit"), None)["statusCode"] == 403
    assert not calls


def test_list_applies_filters_and_returns_a_cursor(admin_app):
    app, calls, state = admin_app
    state["rows"] = [{"id": 30}, {"id": 29}, {"id": 28}]
    response = app.handler(_event("GET /api/v1/admin/audit", query={
        "from": "2026-09-24T00:00:00Z", "module": "clientes", "email": "ops", "before_id": "31", "limit": "2"}), None)
    body = body_of(response)
    assert body["data"] == [{"id": 30}, {"id": 29}] and body["next_cursor"] == 29
    sql, params = calls[0]
    assert "occurred_at >= %s AND actor_email ILIKE %s AND module_key = %s AND id < %s" in sql
    assert params[1:] == ["%ops%", "clientes", 31, 3]


@pytest.mark.parametrize("query, message", [
    ({"from": "ayer"}, "fecha ISO"), ({"limit": "500"}, "limit"), ({"before_id": "x"}, "número")])
def test_list_rejects_bad_filters(admin_app, query, message):
    app, _, _ = admin_app
    response = app.handler(_event("GET /api/v1/admin/audit", query=query), None)
    assert response["statusCode"] == 400 and message in body_of(response)["error"]["message"]


def test_get_event_returns_the_full_row_or_404(admin_app):
    app, _, state = admin_app
    state["rows"] = [{"id": 7, "before": {"name": "A"}}]
    assert body_of(app.handler(_event("GET /api/v1/admin/audit/{id}", path={"id": "7"}), None))["data"]["id"] == 7
    state["rows"] = []
    assert app.handler(_event("GET /api/v1/admin/audit/{id}", path={"id": "7"}), None)["statusCode"] == 404


def test_client_event_is_recorded_and_validated(admin_app, audit_calls):
    app, _, state = admin_app
    ok = app.handler(_event("POST /api/v1/audit/events",
                            body={"action": "export", "module_key": "clientes", "metadata": {"rows": 3}}), None)
    assert ok["statusCode"] == 200
    assert ("record", "export", {"module_key": "clientes", "metadata": {"rows": 3}}) in audit_calls
    bad_action = app.handler(_event("POST /api/v1/audit/events", body={"action": "delete", "module_key": "x"}), None)
    state["module_exists"] = False
    bad_module = app.handler(_event("POST /api/v1/audit/events", body={"action": "view", "module_key": "x"}), None)
    assert bad_action["statusCode"] == bad_module["statusCode"] == 400


def test_list_defaults_to_the_last_three_months(admin_app):
    app, calls, _ = admin_app
    app.handler(_event("GET /api/v1/admin/audit"), None)
    app.handler(_event("GET /api/v1/admin/audit", query={"from": "2025-01-01T00:00:00Z"}), None)
    assert "occurred_at >= now() - interval '3 months'" in calls[0][0]
    assert "interval '3 months'" not in calls[1][0]


def test_maintenance_creates_the_next_months(monkeypatch):
    calls = []
    monkeypatch.setattr(pg, "query", lambda sql, params=(): calls.append((sql, params)) or [{"created": 2}])
    maintenance = load_stack_module("admin", "audit_maintenance")
    assert maintenance.handler({}, None) == {"created": 2}
    assert calls == [("SELECT audit.ensure_partitions(%s) AS created", [3])]

