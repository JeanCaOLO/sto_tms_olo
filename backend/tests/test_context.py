import pytest

from conftest import body_of, http_event, load_stack_module
from tms_common import pg

USER = {"id": "auth-1", "email": "dev@olo.com"}
COUNTRY_CR = "c-cr"
WAREHOUSE = "w-1"


def _scope(country=None, warehouse=None, customer=None):
    return {"id": "s", "role_id": None, "country_id": country, "warehouse_id": warehouse, "customer_id": customer}


@pytest.fixture
def context_app(monkeypatch):
    state = {"scopes": [], "calls": []}

    def fake_query(sql, params=()):
        state["calls"].append((sql, list(params)))
        if "FROM app_users" in sql:
            return [{"id": "app-1", "organization_id": "org"}]
        if "FROM user_scopes" in sql:
            return state["scopes"]
        if "FROM warehouses WHERE id" in sql:
            return [{"id": WAREHOUSE, "country_id": COUNTRY_CR}]
        return [{"id": "row"}]

    monkeypatch.setattr(pg, "query", fake_query)
    return load_stack_module("context"), state


def test_global_scope_sees_all_countries(context_app):
    app, state = context_app
    state["scopes"] = [_scope()]
    response = app.handler(http_event("GET /api/v1/countries", user=USER), None)
    assert body_of(response)["data"] == [{"id": "row"}]
    assert "ANY" not in state["calls"][-1][0]


def test_country_scope_filters_countries_and_no_scope_sees_nothing(context_app):
    app, state = context_app
    state["scopes"] = [_scope(country=COUNTRY_CR)]
    app.handler(http_event("GET /api/v1/countries", user=USER), None)
    assert state["calls"][-1][1] == [[COUNTRY_CR]]
    state["scopes"] = []
    assert body_of(app.handler(http_event("GET /api/v1/countries", user=USER), None))["data"] == []


def test_country_scope_covers_its_warehouses(context_app):
    app, state = context_app
    state["scopes"] = [_scope(country=COUNTRY_CR)]
    event = http_event("GET /api/v1/warehouses/{id}/customers", path={"id": WAREHOUSE}, user=USER)
    assert app.handler(event, None)["statusCode"] == 200


def test_foreign_country_is_forbidden_and_missing_scopes_fail_closed(context_app):
    app, state = context_app
    state["scopes"] = [_scope(country="c-ve")]
    event = http_event("GET /api/v1/warehouses/{id}/customers", path={"id": WAREHOUSE}, user=USER)
    assert app.handler(event, None)["statusCode"] == 403
    state["scopes"] = []
    assert app.handler(event, None)["statusCode"] == 403


def test_me_context_returns_camel_case_scopes(context_app):
    app, state = context_app
    state["scopes"] = [_scope(country=COUNTRY_CR)]
    data = body_of(app.handler(http_event("GET /api/v1/me/context", user=USER), None))["data"]
    assert data == {"scopes": [{"id": "s", "roleId": None, "countryId": COUNTRY_CR,
                                "warehouseId": None, "customerId": None}]}


def test_request_without_authorizer_context_is_401(context_app):
    app, _ = context_app
    assert app.handler(http_event("GET /api/v1/me/context"), None)["statusCode"] == 401
