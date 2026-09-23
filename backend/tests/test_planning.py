import pytest

from conftest import body_of, http_event, load_stack_module
from tms_common import pg

USER = {"id": "auth-1", "email": "ops@ologistics.com"}


@pytest.fixture
def planning(monkeypatch):
    calls = []

    def fake_query(sql, params=()):
        calls.append((sql, list(params)))
        if "FROM app_users" in sql:
            return [{"organization_id": "org-1"}]
        return [{"order_number": "E1", "total_weight": None, "capacity_known": False}]

    monkeypatch.setattr(pg, "query", fake_query)
    return load_stack_module("planning"), calls


def test_default_is_tomorrow_in_costa_rica(planning):
    app, calls = planning
    response = app.handler(http_event("GET /api/v1/planificacion/pedidos", user=USER), None)
    assert body_of(response)["data"][0]["capacity_known"] is False
    sql, params = calls[-1]
    assert "America/Costa_Rica" in sql and "situacion = 'GENE'" in sql and params == ["org-1"]


def test_explicit_date_is_bound_as_parameter(planning):
    app, calls = planning
    app.handler(http_event("GET /api/v1/planificacion/pedidos", query={"fecha_entrega": "2026-09-24"}, user=USER), None)
    assert calls[-1][1] == ["org-1", "2026-09-24"]


@pytest.mark.parametrize("query", [{"fecha_entrega": "24/09/2026"}, {"fecha_entrega": "2026-09-24'; drop"}, {"dia": "ayer"}])
def test_invalid_dates_are_400(planning, query):
    app, _ = planning
    assert app.handler(http_event("GET /api/v1/planificacion/pedidos", query=query, user=USER), None)["statusCode"] == 400
