import pytest

from conftest import body_of, http_event, load_stack_module
from tms_common import eflow_db


@pytest.fixture
def mock_app(monkeypatch):
    monkeypatch.delenv("EFLOW_MODE", raising=False)  # mock es el default

    def never(*_args, **_kwargs):
        raise AssertionError("En modo mock no se debe tocar EFLOW")

    monkeypatch.setattr(eflow_db, "query", never)
    return load_stack_module("eflow")


def test_health_reports_mock_mode(mock_app):
    assert body_of(mock_app.handler(http_event("GET /api/health"), None)) == {"ok": True, "pais": "cr", "mode": "mock"}


def test_trips_have_the_viaje_row_shape_and_totals(mock_app):
    trips = body_of(mock_app.handler(http_event("GET /api/viajes", query={"limit": "2"}), None))
    assert [t["trip_id"] for t in trips] == [1004, 1003]
    trip = trips[1]
    assert trip["route_codes"] == "03" and trip["customer_count"] == 5
    assert trip["driver_name"] and trip["carrier_name"] and trip["vehicle_plate"]
    assert trip["trip_created"].endswith("Z")


def test_trip_detail_orders_and_not_found(mock_app):
    trip = body_of(mock_app.handler(http_event("GET /api/viajes/{id}", path={"id": "1001"}), None))
    orders = body_of(mock_app.handler(http_event("GET /api/viajes/{id}/pedidos", path={"id": "1001"}), None))
    assert len(orders) == trip["customer_count"] == 5
    assert trip["total_weight"] == round(sum(o["total_weight"] for o in orders), 2)
    missing = mock_app.handler(http_event("GET /api/viajes/{id}", path={"id": "9"}), None)
    assert missing["statusCode"] == 404


def test_catalogs_filter_by_carrier_and_route_days(mock_app):
    drivers = body_of(mock_app.handler(http_event("GET /api/catalogos/conductores",
                                                  query={"transportistaId": "3"}), None))
    assert drivers and all(d["carrier_id"] == 3 for d in drivers)
    days = body_of(mock_app.handler(http_event("GET /api/catalogos/rutas-dias"), None))
    assert {"route_code", "route_name", "day_ids", "promesa_horas"} <= set(days[0])


def test_live_mode_route_days_is_not_ported_yet(monkeypatch):
    monkeypatch.setenv("EFLOW_MODE", "live")
    app = load_stack_module("eflow")
    assert app.handler(http_event("GET /api/catalogos/rutas-dias"), None)["statusCode"] == 501
