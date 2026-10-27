from datetime import timedelta

import pytest

from conftest import APP_USER, DRIVER, GUIDE, NOW, ORG, ROUTE, body_of, driver_row, event
from mobile_api import auth, db as db_module, logic, positions, presence, routes, security, stops

HEARTBEAT = "POST /api/mobile/v1/presencia/heartbeat"
LOGIN = "POST /api/mobile/v1/auth/login"
LOGOUT = "POST /api/mobile/v1/auth/logout"
TRANSITION = "POST /api/mobile/v1/paradas/{id}/transicion"
INCIDENT = "POST /api/mobile/v1/paradas/{id}/novedades"
UUID1 = "44444444-4444-4444-8444-444444444444"
UUID2 = "55555555-4444-4444-8444-444444444444"


@pytest.fixture(autouse=True)
def frozen_clock(monkeypatch):
    for module in (positions, presence, stops):
        monkeypatch.setattr(module, "now", lambda: NOW)


def presence_writes(fake_db, table="driver_presence"):
    return [c for c in fake_db.calls if f"INTO {table}" in c[0]]


# --- reglas puras ---------------------------------------------------------------------------------------------------

@pytest.mark.parametrize("status,age,expected", [
    ("online", 10, "online"), ("online", 300, "online"), ("online", 301, "stale"), ("online", 1800, "stale"),
    ("online", 1801, "offline"), ("offline", 5, "offline"),       # logout explícito manda sobre la antigüedad
])
def test_presence_signal(status, age, expected):
    assert logic.presence_signal(status, NOW - timedelta(seconds=age), NOW) == expected


def test_presence_signal_without_data_is_none():
    assert logic.presence_signal(None, None, NOW) == "none"


def test_clamp_to_now_keeps_the_point_of_a_fast_clock_but_rejects_absurd_dates():
    assert logic.clamp_to_now(NOW + timedelta(minutes=30), NOW) == NOW
    assert logic.clamp_to_now(NOW - timedelta(hours=3), NOW) == NOW - timedelta(hours=3)
    with pytest.raises(ValueError):
        logic.clamp_to_now(NOW + timedelta(days=3), NOW)


# --- heartbeat --------------------------------------------------------------------------------------------------------

def test_heartbeat_marks_the_driver_online(call, fake_db):
    response = call(HEARTBEAT, body={"device_id": "dev-1", "battery_pct": 71})
    assert response["statusCode"] == 200 and body_of(response)["data"]["status"] == "online"
    sql_text, params = presence_writes(fake_db)[0]
    assert params == [DRIVER, ORG, "online", "heartbeat", NOW, "dev-1", 71]


def test_heartbeat_replayed_from_the_offline_queue_keeps_its_device_time(call, fake_db):
    queued = NOW - timedelta(minutes=12)
    call(HEARTBEAT, body={"occurred_at": queued.isoformat()})
    assert presence_writes(fake_db)[0][1][4] == queued
    assert "last_seen_at <= EXCLUDED.last_seen_at" in presence_writes(fake_db)[0][0]   # no pisa uno más nuevo


def test_heartbeat_with_fast_clock_is_stored_as_now(call, fake_db):
    call(HEARTBEAT, body={"occurred_at": (NOW + timedelta(minutes=20)).isoformat()})
    assert presence_writes(fake_db)[0][1][4] == NOW


def test_heartbeat_rejects_a_garbage_date_and_needs_a_token(call, fake_db):
    assert call(HEARTBEAT, body={"occurred_at": "ayer"})["statusCode"] == 400
    assert routes.handler(event(HEARTBEAT, token=None), None)["statusCode"] == 401
    assert not presence_writes(fake_db)


def test_a_presence_failure_never_breaks_the_heartbeat_response(call, fake_db, monkeypatch):
    def boom(*_args, **_kwargs):
        raise RuntimeError("bd caída")

    monkeypatch.setattr(db_module, "query", boom)
    monkeypatch.setattr(auth, "authenticate", lambda _event: auth.Driver(APP_USER, "a", ORG, DRIVER, None, None))
    assert routes.handler(event(HEARTBEAT, body={}), None)["statusCode"] == 200


# --- login / logout ---------------------------------------------------------------------------------------------------

@pytest.fixture
def fast_password(monkeypatch):
    monkeypatch.setattr(security, "verify_password", lambda password, hashed: True)


def test_login_marks_the_driver_online(fake_db, fast_password):
    fake_db.answer("FROM auth_credentials c WHERE", [{"auth_user_id": "aaaaaaaa-0000-4000-8000-000000000001",
                                                       "email": "chofer@demo.tms.local", "password_hash": "h"}])
    response = routes.handler(event(LOGIN, body={"email": "chofer@demo.tms.local", "password": "x",
                                                  "device_id": "dev-9"}, token=None), None)
    assert response["statusCode"] == 200
    params = presence_writes(fake_db)[0][1]
    assert params[:4] == [DRIVER, ORG, "online", "login"] and params[5] == "dev-9"


def test_failed_login_does_not_touch_presence(fake_db, monkeypatch):
    monkeypatch.setattr(security, "verify_password", lambda password, hashed: False)
    fake_db.answer("FROM auth_credentials c WHERE", [{"auth_user_id": "a", "email": "e", "password_hash": "h"}])
    routes.handler(event(LOGIN, body={"email": "e@x.com", "password": "mala"}, token=None), None)
    assert not presence_writes(fake_db)


def test_logout_marks_offline_with_the_device_time(fake_db):
    fake_db.answer("FROM mobile_refresh_tokens t", [{"id": "rt-1", "app_user_id": APP_USER}])
    queued = NOW - timedelta(minutes=3)
    response = routes.handler(event(LOGOUT, body={"refresh_token": "x", "occurred_at": queued.isoformat()},
                                    token=None), None)
    assert response["statusCode"] == 200
    sql_text, params = presence_writes(fake_db)[0]
    assert "'offline', 'logout'" in sql_text and params == [queued, None, APP_USER]


def test_logout_with_an_unknown_token_stays_idempotent_and_marks_nobody(fake_db):
    fake_db.answer("FROM mobile_refresh_tokens t", [])
    assert routes.handler(event(LOGOUT, body={"refresh_token": "?"}, token=None), None)["statusCode"] == 200
    assert not presence_writes(fake_db)


# --- posiciones -------------------------------------------------------------------------------------------------------

def _position(client_id=UUID1, **over):
    base = {"client_id": client_id, "route_id": ROUTE, "lat": 9.93, "lng": -84.08,
            "recorded_at": "2026-10-16T14:59:00Z", "speed_mps": 10, "battery_pct": 80}
    base.update(over)
    return base


def _active_route(fake_db):
    fake_db.answer("FROM routes r LEFT JOIN stores s", [{"id": ROUTE, "status": "En tránsito", "vehicle_id": None,
                                                         "driver_id": DRIVER, "departed_at": None,
                                                         "actual_end_time": None, "origin_lat": None,
                                                         "origin_lng": None}])
    fake_db.answer("INSERT INTO tracking_positions", [{"client_id": UUID1}])


def test_positions_refresh_presence_without_reactivating_a_logged_out_driver(call, fake_db):
    _active_route(fake_db)
    call("POST /api/mobile/v1/posiciones", body={"positions": [_position(battery_pct=64)], "device_id": "d"})
    sql_text, params = presence_writes(fake_db)[0]
    assert params == [DRIVER, ORG, NOW, "d", 64]
    assert "driver_presence.status = 'online'" in sql_text


def test_position_from_a_fast_clock_is_saved_instead_of_dropped(call, fake_db):
    _active_route(fake_db)
    result = body_of(call("POST /api/mobile/v1/posiciones",
                          body={"positions": [_position(recorded_at="2026-10-16T15:20:00Z")]}))["data"]
    assert result["accepted"] == 1 and result["rejected"] == []
    stored = presence_writes(fake_db, "tracking_positions")[0][1]
    assert stored[-1] == NOW                                        # hora acotada a "ahora"


def test_an_absurd_recorded_at_is_still_rejected_alone(call, fake_db):
    _active_route(fake_db)
    result = body_of(call("POST /api/mobile/v1/posiciones", body={"positions": [
        _position(UUID1), _position(UUID2, recorded_at="2030-01-01T00:00:00Z")]}))["data"]
    assert result["accepted"] == 1 and [r["client_id"] for r in result["rejected"]] == [UUID2]


# --- idempotencia de novedades y transiciones -------------------------------------------------------------------------

def _guide(fake_db):
    fake_db.answer("FROM dispatch_guides g JOIN routes r", [{
        "id": GUIDE, "route_id": ROUTE, "organization_id": ORG, "order_id": None, "delivery_status": "pending",
        "notes": None, "route_status": "En tránsito", "driver_id": DRIVER, "stop_lat": None, "stop_lng": None}])


def test_incident_with_client_id_is_created_once(call, fake_db):
    _guide(fake_db)
    fake_db.answer("INSERT INTO tracking_events", [{"id": "e1"}])
    first = call(INCIDENT, path={"id": GUIDE}, body={"description": "Cliente ausente", "client_id": UUID1})
    assert first["statusCode"] == 201 and body_of(first)["data"]["duplicate"] is False
    assert fake_db.wrote("INSERT INTO tracking_events")[0][1][-1] == UUID1
    fake_db.answer("INSERT INTO tracking_events", [])                # el reenvío choca con el índice único
    again = call(INCIDENT, path={"id": GUIDE}, body={"description": "Cliente ausente", "client_id": UUID1})
    assert again["statusCode"] == 200 and body_of(again)["data"]["duplicate"] is True


def test_incident_without_client_id_keeps_the_old_behaviour(call, fake_db):
    _guide(fake_db)
    assert call(INCIDENT, path={"id": GUIDE}, body={"description": "x"})["statusCode"] == 201
    assert "ON CONFLICT" not in fake_db.wrote("INSERT INTO tracking_events")[0][0]


def test_invalid_client_id_is_400(call, fake_db):
    _guide(fake_db)
    assert call(INCIDENT, path={"id": GUIDE}, body={"description": "x", "client_id": "nope"})["statusCode"] == 400
    assert call(TRANSITION, path={"id": GUIDE}, body={"to": "pending", "client_id": 7})["statusCode"] == 400


def test_replayed_transition_does_not_duplicate_events(call, fake_db):
    _guide(fake_db)
    fake_db.answer("INSERT INTO tracking_events", [])                # ya existía: sin evento nuevo
    fake_db.answer("count(*) FILTER", [{"done": 0, "pending": 1}])
    response = call(TRANSITION, path={"id": GUIDE}, body={"to": "pending", "client_id": UUID1})
    assert response["statusCode"] == 200
    assert len(fake_db.wrote("INSERT INTO tracking_events")) == 1
