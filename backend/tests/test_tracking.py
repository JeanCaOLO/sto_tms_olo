from datetime import date, datetime, timedelta, timezone

import pytest

from conftest import body_of, http_event, load_stack_module, make_permissions
from tms_common.errors import HttpError

USER = {"id": "auth-1", "email": "ops@ologistics.com"}
ORG = "00000000-0000-4000-8000-0000000000aa"
ROUTE = "11111111-1111-4111-8111-111111111111"
GUIDE = "22222222-2222-4222-8222-222222222222"
TRIP = "33333333-3333-4333-8333-333333333333"
NOW = datetime(2026, 10, 16, 15, 0, tzinfo=timezone.utc)


@pytest.fixture
def logic():
    return load_stack_module("tracking", "tracking_logic")


# --- reglas puras --------------------------------------------------------------------------------

@pytest.mark.parametrize("raw,expected", [
    ("Planificada", "planned"), ("planificada", "planned"), ("planned", "planned"),
    ("En tránsito", "active"), ("en_ruta", "active"), ("in_progress", "active"), ("active", "active"),
    ("Completada", "completed"), ("completed", "completed"), ("anulado", "cancelled"),
    ("Con Retraso", "unknown"), (None, "unknown"),
])
def test_route_state_accepts_both_vocabularies(logic, raw, expected):
    assert logic.route_state(raw) == expected


def test_guide_state_prefers_delivery_status_and_falls_back_to_status(logic):
    assert logic.guide_state("delivered", "Pendiente") == "delivered"
    assert logic.guide_state(None, "Entregado") == "delivered"
    assert logic.guide_state("failed") == "failed"
    assert logic.guide_state(None, "pendiente") == "pending"
    assert logic.guide_state("in_transit") == "pending"


def test_signal_thresholds(logic):
    assert logic.signal(None, NOW) == "none"
    assert logic.signal(NOW - timedelta(seconds=60), NOW) == "online"
    assert logic.signal(NOW - timedelta(minutes=10), NOW) == "stale"
    assert logic.signal(NOW - timedelta(minutes=4), NOW) == "online"      # cobertura irregular: hasta 5 min
    assert logic.signal(NOW - timedelta(minutes=25), NOW) == "stale"
    assert logic.signal(NOW - timedelta(minutes=45), NOW) == "offline"
    assert logic.signal(NOW - timedelta(hours=2), NOW) == "offline"
    naive = (NOW - timedelta(seconds=30)).replace(tzinfo=None)
    assert logic.signal(naive, NOW) == "online"


def test_map_color(logic):
    assert logic.map_color("active", "online") == "green"
    assert logic.map_color("active", "stale") == "amber"
    assert logic.map_color("active", "offline") == "gray"
    assert logic.map_color("active", "none") == "gray"
    assert logic.map_color("planned", "online") == "gray"
    assert logic.map_color("completed", "none") == "blue"


def test_progress_counts_failed_as_done(logic):
    result = logic.progress(["delivered", "failed", "pending", "pending"])
    assert result == {"total": 4, "done": 2, "delivered": 1, "failed": 1, "percent": 50}
    assert logic.progress([])["percent"] == 0


def _pos(**over):
    base = {"client_id": "44444444-4444-4444-8444-444444444444", "route_id": ROUTE, "lat": 9.93, "lng": -84.08,
            "recorded_at": "2026-10-16T14:59:00Z", "speed_mps": 10, "battery_pct": 80}
    base.update(over)
    return base


def test_validate_position_normalizes(logic):
    pos = logic.validate_position(_pos(), NOW)
    assert pos["latitude"] == 9.93 and pos["battery_pct"] == 80 and pos["recorded_at"].tzinfo is not None


@pytest.mark.parametrize("override,message", [
    ({"client_id": "x"}, "client_id"), ({"route_id": None}, "route_id"), ({"lat": 91}, "lat"),
    ({"lng": -181}, "lng"), ({"lat": None}, "lat"), ({"lat": "9"}, "lat"), ({"speed_mps": 120}, "speed_mps"),
    ({"recorded_at": "ayer"}, "recorded_at"), ({"recorded_at": "2026-10-16T16:00:00Z"}, "futuro"),
])
def test_validate_position_rejects_bad_data(logic, override, message):
    with pytest.raises(ValueError, match=message):
        logic.validate_position(_pos(**override), NOW)


def test_evidence_keys_are_scoped_to_the_stop(logic):
    key = logic.new_evidence_key(ROUTE, GUIDE, "image/jpeg")
    assert logic.require_evidence_key(ROUTE, GUIDE, key) == key
    for bad in [key.replace(GUIDE, ROUTE), key.replace(".jpg", ".exe"), "tracking/../x.jpg", None]:
        with pytest.raises(HttpError, match="Llave"):
            logic.require_evidence_key(ROUTE, GUIDE, bad)


def test_evidence_request_and_uploaded_image_checks(logic):
    assert logic.require_evidence_request({"kind": "signature", "mime_type": "image/png"}) == ("signature", "image/png")
    with pytest.raises(HttpError):
        logic.require_evidence_request({"kind": "video", "mime_type": "image/png"})
    with pytest.raises(HttpError):
        logic.require_evidence_request({"kind": "signature", "mime_type": "application/pdf"})
    with pytest.raises(HttpError, match="no se subió"):
        logic.require_uploaded_image(None)
    with pytest.raises(HttpError, match="5 MB"):
        logic.require_uploaded_image({"ContentType": "image/png", "ContentLength": 6 * 1024 * 1024})


# --- handlers ------------------------------------------------------------------------------------

class Db:
    """pg falso: responde por fragmento de SQL y registra cada sentencia."""

    def __init__(self):
        self.calls, self.answers = [], {}

    def answer(self, fragment, rows):
        self.answers[fragment] = rows

    def run(self, sql, params=()):
        flat = " ".join(sql.split())
        self.calls.append((flat, list(params)))
        for fragment, rows in self.answers.items():
            if fragment in flat:
                return rows(list(params)) if callable(rows) else rows
        return []

    def wrote(self, prefix):
        return [(sql, params) for sql, params in self.calls if sql.startswith(prefix)]


@pytest.fixture
def tracking(monkeypatch):
    from tms_common import pg
    db = Db()
    monkeypatch.setattr(pg, "query", db.run)
    monkeypatch.setattr(pg, "run_in_transaction", lambda work, retries=0: work(db.run))
    monkeypatch.setenv("TRACKING_BUCKET", "dev-tms-tracking-1")
    db.answer("FROM app_users", [{"organization_id": ORG}])
    app = load_stack_module("tracking")
    monkeypatch.setattr(app, "_now", lambda: NOW)
    return app, db


def _event(route, *, path=None, query=None, body=None):
    return http_event(route, path=path, query=query, body=body, user=USER)


def _row(**over):
    base = {"id": ROUTE, "route_number": "VJ-1", "route_date": date(2026, 10, 16), "status": "En tránsito",
            "actual_start_time": NOW - timedelta(hours=1), "actual_end_time": None, "planned_start_time": None,
            "created_at": NOW - timedelta(hours=2), "plan_trip_id": TRIP, "country_id": "cr",
            "driver_name": "Ana", "plate": "ABC123", "carrier_name": "Trans", "zone_name": "GAM",
            "last_lat": 9.9, "last_lng": -84.1, "speed_mps": 8, "heading_deg": 90, "battery_pct": 70,
            "last_position_at": NOW - timedelta(seconds=30), "sort_at": NOW - timedelta(hours=1)}
    base.update(over)
    return base


def test_list_viajes_returns_state_color_progress_and_paginates(tracking):
    app, db = tracking
    rows = [_row(), _row(id="55555555-5555-4555-8555-555555555555", status="completada", last_lat=None,
                         last_position_at=None)]
    db.answer("FROM routes r", rows)
    db.answer("FROM dispatch_guides g", [{"route_id": ROUTE, "total": 4, "delivered": 1, "failed": 1}])
    body = body_of(app.handler(_event("GET /api/v1/tracking/viajes", query={"activos": "1", "limit": "1"}), None))
    item = body["data"]["items"][0]
    assert item["state"] == "active" and item["color"] == "green" and item["signal"] == "online"
    assert item["progress"] == {"total": 4, "done": 2, "delivered": 1, "failed": 1, "percent": 50}
    assert body["data"]["next_cursor"].endswith(f"|{ROUTE}")
    sql, params = db.wrote("SELECT r.id")[0]
    assert "lower(r.status) = ANY" in sql and ORG in params


def test_list_requires_view_permission(tracking, caller_permissions):
    app, _ = tracking
    caller_permissions.set(make_permissions({"guias": ["view"]}))
    assert app.handler(_event("GET /api/v1/tracking/viajes"), None)["statusCode"] == 403


def test_list_rejects_a_malformed_cursor(tracking):
    app, _ = tracking
    response = app.handler(_event("GET /api/v1/tracking/viajes", query={"cursor": "x|no-uuid"}), None)
    assert response["statusCode"] == 400


def test_country_filter_is_applied(tracking, caller_permissions):
    app, db = tracking
    caller_permissions.set(make_permissions({"tracking": ["view"]}, countries=("cr-id",)))
    db.answer("FROM routes r", [])
    app.handler(_event("GET /api/v1/tracking/viajes"), None)
    sql, params = db.wrote("SELECT r.id")[0]
    assert "s.country_id = ANY" in sql and ["cr-id"] in params


def _plan_trip(**over):
    base = {"id": TRIP, "status": "pending", "delivery_zone": "GAM", "vehicle_id": "veh", "driver_id": "drv",
            "total_weight": 10, "total_volume": 2, "organization_id": ORG, "country_id": "cr",
            "plan_date": date(2026, 10, 16), "plan_status": "confirmed", "carrier_id": "car"}
    base.update(over)
    return base


def test_start_viaje_bridges_plan_trip_into_route_and_guides(tracking):
    app, db = tracking
    db.answer("FROM plan_trips pt", [_plan_trip()])
    db.answer("FROM plan_stops", [{"order_id": "o1"}, {"order_id": "o2"}])
    db.answer("FROM stores", [{"id": "store-1"}])
    db.answer("INSERT INTO routes", [{"id": ROUTE}])
    response = app.handler(_event("POST /api/v1/tracking/viajes/{id}/iniciar", path={"id": TRIP}), None)
    assert response["statusCode"] == 201
    assert body_of(response)["data"]["route_number"] == "VJ-20261016-33333333"
    guides = db.wrote("INSERT INTO dispatch_guides")
    assert [p[3:5] for _, p in guides] == [["VJ-20261016-33333333-1", 1], ["VJ-20261016-33333333-2", 2]]
    assert db.wrote("INSERT INTO tracking_events")[0][1][3] == "route_started"


def test_start_viaje_is_idempotent(tracking):
    app, db = tracking
    db.answer("FROM plan_trips pt", [_plan_trip()])
    db.answer("SELECT id FROM routes WHERE plan_trip_id", [{"id": ROUTE}])
    response = app.handler(_event("POST /api/v1/tracking/viajes/{id}/iniciar", path={"id": TRIP}), None)
    assert response["statusCode"] == 200 and body_of(response)["data"] == {"route_id": ROUTE, "created": False}
    assert not db.wrote("INSERT INTO routes")


@pytest.mark.parametrize("override,status", [({"plan_status": "draft"}, 409), ({"status": "completed"}, 409),
                                             ({"organization_id": "otra-org"}, 404)])
def test_start_viaje_guards(tracking, override, status):
    app, db = tracking
    db.answer("FROM plan_trips pt", [_plan_trip(**override)])
    response = app.handler(_event("POST /api/v1/tracking/viajes/{id}/iniciar", path={"id": TRIP}), None)
    assert response["statusCode"] == status and not db.wrote("INSERT INTO routes")


def test_start_requires_create_permission(tracking, caller_permissions):
    app, _ = tracking
    caller_permissions.set(make_permissions({"tracking": ["view", "edit"]}))
    response = app.handler(_event("POST /api/v1/tracking/viajes/{id}/iniciar", path={"id": TRIP}), None)
    assert response["statusCode"] == 403


def test_ingest_positions_rejects_bad_dedupes_and_updates_last_position(tracking):
    app, db = tracking
    good = _pos()
    db.answer("FROM routes WHERE organization_id", [{"id": ROUTE, "status": "En tránsito", "vehicle_id": "v", "driver_id": "d"}])
    db.answer("INSERT INTO tracking_positions", [{"client_id": good["client_id"]}])
    body = {"device_id": "dev-1", "positions": [
        good,
        _pos(client_id="66666666-6666-4666-8666-666666666666", lat=200),
        _pos(client_id="77777777-7777-4777-8777-777777777777", route_id="99999999-9999-4999-8999-999999999999"),
    ]}
    result = body_of(app.handler(_event("POST /api/v1/tracking/posiciones", body=body), None))["data"]
    assert result["accepted"] == 1 and result["duplicates"] == 0
    assert {r["reason"] for r in result["rejected"]} == {"lat fuera de rango", "viaje no encontrado"}
    assert len(db.wrote("INSERT INTO tracking_last_positions")) == 1


def test_ingest_ignores_positions_of_a_closed_route(tracking):
    app, db = tracking
    db.answer("FROM routes WHERE organization_id", [{"id": ROUTE, "status": "Completada", "vehicle_id": None, "driver_id": None}])
    result = body_of(app.handler(_event("POST /api/v1/tracking/posiciones", body={"positions": [_pos()]}), None))["data"]
    assert result["accepted"] == 0 and result["rejected"][0]["reason"] == "viaje no activo"
    assert not db.wrote("INSERT INTO tracking_positions")


def test_ingest_limits(tracking):
    app, _ = tracking
    assert app.handler(_event("POST /api/v1/tracking/posiciones", body={"positions": []}), None)["statusCode"] == 400
    too_many = {"positions": [_pos()] * 201}
    assert app.handler(_event("POST /api/v1/tracking/posiciones", body=too_many), None)["statusCode"] == 400


def _guide_row(**over):
    base = {"id": GUIDE, "route_id": ROUTE, "organization_id": ORG, "delivery_status": "pending", "notes": None,
            "route_status": "En tránsito", "country_id": "cr"}
    base.update(over)
    return base


def test_transition_requires_reason_when_failed(tracking):
    app, db = tracking
    db.answer("FROM dispatch_guides g JOIN routes r", [_guide_row()])
    response = app.handler(_event("POST /api/v1/tracking/paradas/{id}/transicion", path={"id": GUIDE},
                                  body={"to": "failed"}), None)
    assert response["statusCode"] == 400


def test_transition_updates_guide_counter_and_event_atomically(tracking):
    app, db = tracking
    db.answer("FROM dispatch_guides g JOIN routes r", [_guide_row()])
    db.answer("FROM dispatch_guides g WHERE g.route_id", [{"done": 3, "pending": 1}])
    body = {"to": "delivered", "receiver_name": "Luis"}
    result = body_of(app.handler(_event("POST /api/v1/tracking/paradas/{id}/transicion", path={"id": GUIDE},
                                        body=body), None))["data"]
    assert result == {"stop_id": GUIDE, "state": "delivered", "done": 3, "pending": 1}
    assert db.wrote("UPDATE dispatch_guides")[0][1][:2] == ["delivered", "Entregado"]
    assert db.wrote("UPDATE routes SET completed_stops")[0][1] == [3, ROUTE]
    assert db.wrote("INSERT INTO tracking_events")[0][1][3] == "delivery_completed"


def test_transition_needs_an_active_route(tracking):
    app, db = tracking
    db.answer("FROM dispatch_guides g JOIN routes r", [_guide_row(route_status="Completada")])
    response = app.handler(_event("POST /api/v1/tracking/paradas/{id}/transicion", path={"id": GUIDE},
                                  body={"to": "delivered"}), None)
    assert response["statusCode"] == 409


def test_complete_viaje_refuses_pending_stops_unless_forced(tracking):
    app, db = tracking
    db.answer("FROM routes r JOIN stores", [{"id": ROUTE, "organization_id": ORG, "status": "En tránsito",
                                              "vehicle_id": None, "driver_id": None, "country_id": "cr"}])
    db.answer("FROM dispatch_guides g WHERE g.route_id", [{"done": 2, "pending": 1}])
    route = "POST /api/v1/tracking/viajes/{id}/completar"
    assert app.handler(_event(route, path={"id": ROUTE}, body={}), None)["statusCode"] == 409
    assert app.handler(_event(route, path={"id": ROUTE}, body={"force": True}), None)["statusCode"] == 200
    assert db.wrote("UPDATE routes SET status = 'Completada'")[0][1] == [2, ROUTE]


class FakeS3:
    def __init__(self, head=None):
        self.head, self.calls = head, []

    def generate_presigned_post(self, bucket, key, **kwargs):
        self.calls.append(("post", key, kwargs))
        return {"url": f"https://{bucket}.s3/", "fields": {"key": key}}

    def head_object(self, Bucket, Key):
        return self.head

    def generate_presigned_url(self, op, Params, ExpiresIn):
        return "https://signed/get"


def test_evidence_upload_signs_only_small_images(tracking, monkeypatch):
    app, db = tracking
    s3 = FakeS3()
    monkeypatch.setattr(app, "s3", lambda: s3)
    db.answer("FROM dispatch_guides g JOIN routes r", [_guide_row()])
    body = {"kind": "signature", "mime_type": "image/png"}
    data = body_of(app.handler(_event("POST /api/v1/tracking/paradas/{id}/evidencias/upload-url",
                                      path={"id": GUIDE}, body=body), None))["data"]
    assert data["key"].startswith(f"tracking/{ROUTE}/{GUIDE}/") and data["key"].endswith(".png")
    _, _, kwargs = s3.calls[0]
    assert {"Content-Type": "image/png"} in kwargs["Conditions"]
    assert ["content-length-range", 1, 5 * 1024 * 1024] in kwargs["Conditions"]


def test_evidence_confirm_stores_key_and_links_guide(tracking, monkeypatch, logic):
    app, db = tracking
    key = logic.new_evidence_key(ROUTE, GUIDE, "image/jpeg")
    monkeypatch.setattr(app, "s3", lambda: FakeS3({"ContentType": "image/jpeg", "ContentLength": 2048}))
    db.answer("FROM dispatch_guides g JOIN routes r", [_guide_row()])
    db.answer("INSERT INTO tracking_evidences", [{"id": "ev-1"}])
    body = {"kind": "photo_invoice", "key": key}
    response = app.handler(_event("POST /api/v1/tracking/paradas/{id}/evidencias", path={"id": GUIDE}, body=body), None)
    assert response["statusCode"] == 201 and body_of(response)["data"]["evidence_id"] == "ev-1"
    assert db.wrote("UPDATE dispatch_guides SET photo_url")[0][1] == [key, GUIDE]


def test_evidence_confirm_rejects_foreign_key_and_missing_upload(tracking, monkeypatch, logic):
    app, db = tracking
    monkeypatch.setattr(app, "s3", lambda: FakeS3(None))
    db.answer("FROM dispatch_guides g JOIN routes r", [_guide_row()])
    route = "POST /api/v1/tracking/paradas/{id}/evidencias"
    foreign = logic.new_evidence_key(ROUTE, ROUTE, "image/jpeg")
    assert app.handler(_event(route, path={"id": GUIDE}, body={"kind": "signature", "key": foreign}), None)["statusCode"] == 400
    own = logic.new_evidence_key(ROUTE, GUIDE, "image/jpeg")
    assert app.handler(_event(route, path={"id": GUIDE}, body={"kind": "signature", "key": own}), None)["statusCode"] == 400
    assert not db.wrote("INSERT INTO tracking_evidences")
