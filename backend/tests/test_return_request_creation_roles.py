"""Cliente crea para su empresa; superusuarios/gerentes eligen dentro de sus scopes."""
from dataclasses import replace

import pytest

from conftest import body_of, http_event, make_permissions
from test_return_requests import app, db, post, item, ORG, CUSTOMER, CLIENT

OTHER = "33333333-3333-3333-3333-333333333333"


def operator(caller_permissions, role="Gerente", modules=None):
    value = make_permissions(modules or {"devoluciones": ["view", "create"]})
    caller_permissions.set(replace(value, role_name=role))


@pytest.fixture
def companies(db, monkeypatch):
    original = db.query

    def query(statement, params=()):
        if "-- creation-companies" in statement:
            db.calls.append((statement, list(params)))
            rows = [{"id": CUSTOMER, "name": "Empresa autorizada"}]
            return rows if OTHER not in params else []
        return original(statement, params)

    monkeypatch.setattr(db, "query", query)
    from tms_common import pg
    monkeypatch.setattr(pg, "query", query)
    db.customer_id = None
    return db


def test_manager_lists_authorized_companies_even_before_requests_exist(app, companies, caller_permissions):
    operator(caller_permissions)
    response = app.handler(http_event("GET /api/v1/solicitudes-devolucion/asignacion", query={"empresas": "1"}), None)
    assert response["statusCode"] == 200
    assert body_of(response)["data"] == [{"id": CUSTOMER, "name": "Empresa autorizada"}]
    statement, params = next((s, p) for s, p in companies.calls if "-- creation-companies" in s)
    assert "tbl_user_scopes" in statement and "FROM tbl_return_requests" not in statement
    assert ORG in params and "app-user" in params


def test_manager_creates_for_an_authorized_company_without_user_assignment(app, companies, caller_permissions):
    operator(caller_permissions)
    response = post(app, {"customer_id": CUSTOMER, "items": [item()]})
    assert response["statusCode"] == 201
    inserted = next(params for s, params in companies.calls if s.lstrip().startswith("INSERT INTO tbl_return_requests"))
    assert inserted[:3] == [ORG, CUSTOMER, "app-user"]


def test_superuser_creates_with_selected_company(app, companies, caller_permissions):
    caller_permissions.set(make_permissions(is_admin=True))
    assert post(app, {"customer_id": CUSTOMER, "items": [item()]})["statusCode"] == 201


def test_manager_cannot_create_outside_scope(app, companies, caller_permissions):
    operator(caller_permissions)
    response = post(app, {"customer_id": OTHER, "items": [item()]})
    assert response["statusCode"] == 403
    assert not any(s.lstrip().startswith("INSERT") for s, _ in companies.calls)


def test_other_operator_cannot_use_company_selection(app, companies, caller_permissions):
    operator(caller_permissions, role="Devoluciones")
    response = post(app, {"customer_id": CUSTOMER, "items": [item()]})
    assert response["statusCode"] == 403


def test_client_does_not_get_operator_company_catalog(app, caller_permissions, monkeypatch):
    from tms_common import pg
    original = pg.query
    def named_query(statement, params=()):
        rows = original(statement, params)
        if 'FROM tbl_app_users' in statement:
            return [{**row, 'customer_name': 'Empresa asignada'} for row in rows]
        return rows
    monkeypatch.setattr(pg, 'query', named_query)
    caller_permissions.set(CLIENT)
    response = app.handler(http_event("GET /api/v1/solicitudes-devolucion/asignacion", query={"empresas": "1"}), None)
    assert response["statusCode"] == 403
