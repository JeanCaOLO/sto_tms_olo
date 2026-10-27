from datetime import date

import pytest

from conftest import DRIVER, NOW, ORG, ORDER, OTHER_DRIVER, ROUTE, TRIP, body_of
from mobile_api import start

START = "POST /api/mobile/v1/viajes/{id}/iniciar"


@pytest.fixture(autouse=True)
def frozen_clock(monkeypatch):
    monkeypatch.setattr(start, "now", lambda: NOW)


def plan_trip(**over):
    base = {"id": TRIP, "status": "pending", "delivery_zone": "GAM", "vehicle_id": "v", "driver_id": DRIVER,
            "total_weight": 50, "total_volume": 2, "vehicle_capacity_weight": 100, "organization_id": ORG,
            "country_id": "c", "plan_date": date(2026, 10, 16), "plan_status": "confirmed", "carrier_id": "k"}
    base.update(over)
    return base


def prepare(fake_db, trip=None, existing=None, stops=2, store=True):
    fake_db.answer("WHERE pt.id = %s", [trip or plan_trip()])
    fake_db.answer("SELECT id FROM routes WHERE plan_trip_id", existing or [])
    fake_db.answer("FROM plan_stops ps LEFT JOIN orders", [
        {"order_id": ORDER, "lat": 9.94 + 0.01 * i, "lng": -84.08} for i in range(stops)])
    fake_db.answer("FROM stores WHERE organization_id", [{"id": "s", "latitude": 9.93, "longitude": -84.08}] if store else [])
    fake_db.answer("FROM zones", [{"id": "z"}])
    fake_db.answer("INSERT INTO routes", [{"id": ROUTE}])


def test_driver_starts_own_planned_trip(call, fake_db):
    prepare(fake_db)
    response = call(START, path={"id": TRIP})
    data = body_of(response)["data"]
    assert response["statusCode"] == 201 and data["created"] is True and data["route_number"] == "VJ-20261016-33333333"
    assert len(fake_db.wrote("INSERT INTO dispatch_guides")) == 2
    event = fake_db.wrote("INSERT INTO tracking_events")[0][1]
    assert event[3] == "route_started" and event[9] == "bbbbbbbb-0000-4000-8000-000000000001"
    route_params = fake_db.wrote("INSERT INTO routes")[0][1]
    assert route_params[2] == DRIVER and route_params[13] is not None       # planned_end_time calculado


def test_first_guide_is_planned_after_the_drive_from_the_origin(call, fake_db):
    prepare(fake_db)
    call(START, path={"id": TRIP})
    first, second = (g[1][-1] for g in fake_db.wrote("INSERT INTO dispatch_guides"))
    assert first > NOW and second > first                                       # llegada 1 > ahora; 2 después de 5 min de servicio


def test_second_start_returns_the_same_route_without_writing(call, fake_db):
    prepare(fake_db, existing=[{"id": ROUTE}])
    response = call(START, path={"id": TRIP})
    assert response["statusCode"] == 200 and body_of(response)["data"] == {"route_id": ROUTE, "created": False}
    assert not fake_db.wrote("INSERT INTO routes") and not fake_db.wrote("INSERT INTO dispatch_guides")


def test_trip_of_another_driver_or_org_is_not_found(call, fake_db):
    prepare(fake_db, trip=plan_trip(driver_id=OTHER_DRIVER))
    assert call(START, path={"id": TRIP})["statusCode"] == 404
    prepare(fake_db, trip=plan_trip(organization_id="otra-org"))
    assert call(START, path={"id": TRIP})["statusCode"] == 404
    assert call(START, path={"id": "no-es-uuid"})["statusCode"] == 404
    assert not fake_db.wrote("INSERT INTO routes")


@pytest.mark.parametrize("trip,stops,store", [
    (plan_trip(plan_status="draft"), 2, True), (plan_trip(status="done"), 2, True), (plan_trip(), 0, True),
    (plan_trip(), 2, False)])
def test_start_conflicts(call, fake_db, trip, stops, store):
    prepare(fake_db, trip=trip, stops=stops, store=store)
    assert call(START, path={"id": TRIP})["statusCode"] == 409
    assert not fake_db.wrote("INSERT INTO routes")


def test_start_without_origin_coordinates_has_no_planned_times(call, fake_db):
    prepare(fake_db)
    fake_db.answer("FROM stores WHERE organization_id", [{"id": "s", "latitude": None, "longitude": None}])
    call(START, path={"id": TRIP})
    assert all(g[1][-1] is None for g in fake_db.wrote("INSERT INTO dispatch_guides"))
