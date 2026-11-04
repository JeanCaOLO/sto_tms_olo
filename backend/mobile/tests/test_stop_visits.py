"""Tiempo en cada parada: entrada al radio de 150 m, salida a > 200 m y permanencia, con la hora de cada posición."""

from datetime import datetime, timedelta, timezone

import pytest

from conftest import DRIVER, GUIDE, NOW, ORDER, ORG, ROUTE, body_of
from mobile_api import evidence, logic, positions, stops, trips

STOP_LAT, STOP_LNG = 9.9300, -84.0800
T0 = datetime(2026, 10, 16, 14, 0, tzinfo=timezone.utc)
DEG_PER_M = 1 / 111_320   # grados de latitud por metro


def at(minutes, meters_north=0.0):
    """Posición `minutes` después de T0 y `meters_north` metros al norte de la parada."""
    return {"recorded_at": T0 + timedelta(minutes=minutes), "latitude": STOP_LAT + meters_north * DEG_PER_M,
            "longitude": STOP_LNG}


def stop(**over):
    base = {"id": "g1", "state": "pending", "lat": STOP_LAT, "lng": STOP_LNG, "arrived_at": None,
            "departed_at": None, "completed_at": None}
    base.update(over)
    return base


def test_arrival_departure_and_dwell_use_the_position_times():
    found = logic.detect_visits([at(0, 900), at(10, 100), at(14, 60), at(30, 400)], [stop()])
    visit = found["upserts"][0]
    assert visit["arrived_at"] == T0 + timedelta(minutes=10) and visit["distance_m"] == 100
    assert visit["departed_at"] == T0 + timedelta(minutes=30) and visit["dwell_seconds"] == 20 * 60
    assert found["deletes"] == []


def test_gps_noise_between_150_and_200_m_does_not_split_the_visit():
    found = logic.detect_visits([at(0, 100), at(5, 180), at(8, 120), at(20, 500)], [stop()])
    assert found["upserts"][0]["dwell_seconds"] == 20 * 60      # una sola visita, no 0-5 y 8-20


def test_still_inside_keeps_the_visit_open():
    visit = logic.detect_visits([at(0, 100), at(10, 100)], [stop()])["upserts"][0]
    assert visit["departed_at"] is None and visit["dwell_seconds"] is None


def test_next_batch_closes_a_visit_opened_before():
    stored = stop(arrived_at=T0)
    visit = logic.detect_visits([at(25, 400)], [stored])["upserts"][0]
    assert visit["arrived_at"] == T0 and visit["dwell_seconds"] == 25 * 60


def test_a_late_point_older_than_the_arrival_does_not_close_the_visit():
    stored = stop(arrived_at=T0 + timedelta(minutes=10))
    assert logic.detect_visits([at(2, 900)], [stored]) == {"upserts": [], "deletes": []}


def test_driving_past_a_pending_stop_is_not_a_visit():
    assert logic.detect_visits([at(0, 100), at(0.5, 400)], [stop()]) == {"upserts": [], "deletes": []}


def test_driving_past_removes_an_open_visit_that_turns_out_short():
    found = logic.detect_visits([at(0.5, 400)], [stop(arrived_at=T0)])
    assert found == {"upserts": [], "deletes": ["g1"]}


def test_a_completed_stop_still_records_the_arrival_that_came_before_the_delivery():
    done = stop(state="delivered", completed_at=T0 + timedelta(minutes=12))
    visit = logic.detect_visits([at(10, 50), at(30, 500)], [done])["upserts"][0]
    assert visit["dwell_seconds"] == 20 * 60


def test_a_completed_stop_ignores_later_passes_by_the_place():
    done = stop(state="delivered", completed_at=T0 + timedelta(minutes=12))
    assert logic.detect_visits([at(60, 50), at(70, 500)], [done]) == {"upserts": [], "deletes": []}


def test_stops_without_coordinates_are_skipped():
    assert logic.detect_visits([at(0, 10)], [stop(lat=None, lng=None)]) == {"upserts": [], "deletes": []}


def test_two_nearby_stops_are_tracked_independently():
    far = stop(id="g2", lat=STOP_LAT + 1000 * DEG_PER_M)
    found = logic.detect_visits([at(0, 50), at(20, 400)], [stop(), far])
    assert [v["id"] for v in found["upserts"]] == ["g1"]


# --- ingesta ------------------------------------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def frozen_clock(monkeypatch):
    for module in (trips, positions, stops, evidence):
        monkeypatch.setattr(module, "now", lambda: NOW)


def guide_for_visits(**over):
    base = {"id": GUIDE, "route_id": ROUTE, "delivery_status": "pending", "status": "Pendiente",
            "actual_arrival_time": None, "latitude": STOP_LAT, "longitude": STOP_LNG, "arrived_at": None,
            "departed_at": None}
    base.update(over)
    return base


def send(call, fake_db, rows, *points):
    fake_db.answer("FROM routes r LEFT JOIN stores s", [{
        "id": ROUTE, "status": "En tránsito", "vehicle_id": "v", "driver_id": "88888888-8888-4888-8888-888888888888",
        "departed_at": NOW, "actual_end_time": None, "origin_lat": None, "origin_lng": None}])
    fake_db.answer("INSERT INTO tracking_positions", [{"client_id": p["client_id"]} for p in points])
    fake_db.answer("LEFT JOIN tracking_stop_visits v", rows)
    body = {"positions": list(points)}
    return body_of(call("POST /api/mobile/v1/posiciones", body=body))["data"]


def point(n, minutes_ago, meters_north=0.0, **over):
    base = {"client_id": f"aaaaaaa{n}-0000-4000-8000-000000000000", "route_id": ROUTE,
            "lat": STOP_LAT + meters_north * DEG_PER_M, "lng": STOP_LNG,
            "recorded_at": (NOW - timedelta(minutes=minutes_ago)).isoformat(), "speed_mps": 5, "battery_pct": 80}
    base.update(over)
    return base


def test_ingest_stores_the_arrival_with_the_position_time_not_the_send_time(call, fake_db):
    send(call, fake_db, [guide_for_visits()], point(1, 20, 900), point(2, 12, 80))
    (sql, params), = fake_db.wrote("INSERT INTO tracking_stop_visits")
    assert params[2] == GUIDE and params[3] == NOW - timedelta(minutes=12) and params[4] is None


def test_ingest_stores_the_departure_of_an_open_visit(call, fake_db):
    open_visit = guide_for_visits(arrived_at=NOW - timedelta(minutes=30))
    send(call, fake_db, [open_visit], point(3, 2, 500))
    (sql, params), = fake_db.wrote("INSERT INTO tracking_stop_visits")
    assert params[4] == NOW - timedelta(minutes=2) and params[5] == 28 * 60


def test_ingest_ignores_mock_points_for_visits(call, fake_db):
    send(call, fake_db, [guide_for_visits()], point(4, 5, 10, is_mock=True))
    assert not fake_db.wrote("INSERT INTO tracking_stop_visits")


def test_delivery_marks_the_visit_as_completed(call, fake_db):
    fake_db.answer("FROM dispatch_guides g JOIN routes r", [{
        "id": GUIDE, "route_id": ROUTE, "organization_id": ORG, "order_id": ORDER, "order_number": "PED-001",
        "delivery_status": "pending", "notes": None, "route_status": "En tránsito", "driver_id": DRIVER,
        "stop_lat": None, "stop_lng": None, "evidence_kinds": ["photo_invoice", "signature"]}])
    fake_db.answer("FROM dispatch_guides g WHERE g.route_id", [{"done": 1, "pending": 1}])
    response = call("POST /api/mobile/v1/paradas/{id}/transicion", path={"id": GUIDE},
                    body={"to": "delivered", "lat": 9.0, "lng": -84.0, "occurred_at": "2026-10-16T14:50:00Z"})
    assert response["statusCode"] == 200
    (sql, params), = fake_db.wrote("UPDATE tracking_stop_visits")
    assert params == [datetime(2026, 10, 16, 14, 50, tzinfo=timezone.utc), GUIDE]
