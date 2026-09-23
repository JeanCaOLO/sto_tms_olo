from decimal import Decimal

import pytest

from conftest import body_of, http_event, load_stack_module
from tms_common import eflow_db
from tms_common.config import EflowConfig

NAMES = EflowConfig("h", 1433, "u", "p", "EFLOW_WMH", "EFLOW_OLO")


@pytest.fixture
def eflow_app(monkeypatch):
    calls = []

    def fake_query(country, sql, params=None):
        calls.append((country, sql, params))
        return fake_query.rows

    fake_query.rows = [{"trip_id": 1, "total_weight": Decimal("725.48")}]
    monkeypatch.setenv("EFLOW_MODE", "live")
    monkeypatch.setattr(eflow_db, "query", fake_query)
    monkeypatch.setattr(eflow_db, "db_names", lambda _country: NAMES)
    return load_stack_module("eflow"), fake_query, calls


def test_trips_clamp_limit_and_return_decimals_as_numbers(eflow_app):
    app, _, calls = eflow_app
    response = app.handler(http_event("GET /api/viajes", query={"limit": "5000", "pais": "VE"}), None)
    assert body_of(response) == [{"trip_id": 1, "total_weight": 725.48}]
    country, sql, params = calls[-1]
    assert country == "ve" and params == {"limit": 1000}
    assert "EFLOW_WMH.dbo.journeys" in sql


def test_unknown_country_falls_back_to_cr(eflow_app):
    app, _, calls = eflow_app
    app.handler(http_event("GET /api/catalogos/rutas", query={"pais": "mx"}), None)
    assert calls[-1][0] == "cr"


def test_trip_id_validation_and_not_found(eflow_app):
    app, fake_query, _ = eflow_app
    bad = app.handler(http_event("GET /api/viajes/{id}", path={"id": "abc"}), None)
    assert bad["statusCode"] == 400 and body_of(bad) == {"error": "invalid_id"}
    fake_query.rows = []
    missing = app.handler(http_event("GET /api/viajes/{id}", path={"id": "42"}), None)
    assert missing["statusCode"] == 404


def test_carrier_filter_is_bound_as_parameter(eflow_app):
    app, _, calls = eflow_app
    app.handler(http_event("GET /api/catalogos/conductores", query={"transportistaId": "7"}), None)
    assert calls[-1][2] == {"carrier_id": 7}
    app.handler(http_event("GET /api/catalogos/vehiculos", query={"transportistaId": "x"}), None)
    assert calls[-1][2] == {"carrier_id": None}


def test_database_failure_maps_to_502(eflow_app, monkeypatch):
    app, _, _ = eflow_app

    def boom(*_args, **_kwargs):
        raise ConnectionError("timeout")

    monkeypatch.setattr(eflow_db, "query", boom)
    response = app.handler(http_event("GET /api/health"), None)
    assert response["statusCode"] == 502
    assert body_of(response)["error"] == "eflow_query_failed"
