from datetime import date, datetime, timedelta, timezone

import pytest

from conftest import body_of, http_event, load_stack_module, make_permissions
from tms_common.errors import HttpError

USER = {"id": "auth-1", "email": "ops@ologistics.com"}
ORG = "00000000-0000-4000-8000-0000000000aa"
ROUTE = "11111111-1111-4111-8111-111111111111"
GUIDE = "22222222-2222-4222-8222-222222222222"
TRIP = "33333333-3333-4333-8333-333333333333"
ORDER = "55555555-5555-4555-8555-555555555555"
DRIVER = "88888888-8888-4888-8888-888888888888"
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


def _route_for_ingest(**over):
    base = {"id": ROUTE, "status": "En tránsito", "vehicle_id": "v", "driver_id": "d", "departed_at": None,
            "actual_end_time": None, "origin_lat": None, "origin_lng": None}
    base.update(over)
    return base


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
    app._URL_CACHE.clear()
    monkeypatch.setattr(app, "_now", lambda: NOW)
    return app, db


def _event(route, *, path=None, query=None, body=None):
    return http_event(route, path=path, query=query, body=body, user=USER)


def _row(**over):
    base = {"id": ROUTE, "route_number": "VJ-1", "route_date": date(2026, 10, 16), "status": "En tránsito",
            "actual_start_time": NOW - timedelta(hours=1), "actual_end_time": None, "planned_end_time": None,
            "created_at": NOW - timedelta(hours=2), "departed_at": None,
            "organization_id": ORG, "country_id": "cr-id", "country": "CR", "timezone": "America/Costa_Rica",
            "origin_name": "Sede", "origin_lat": None, "origin_lng": None, "driver_id": None,
            "driver_name": "Ana", "plate": "ABC123", "zone_name": "GAM",
            "last_lat": 9.9, "last_lng": -84.1, "speed_mps": 8,
            "last_position_at": NOW - timedelta(seconds=30), "sort_at": NOW - timedelta(hours=1)}
    base.update(over)
    return base


def test_list_requires_view_permission(tracking, caller_permissions):
    app, _ = tracking
    caller_permissions.set(make_permissions({"guias": ["view"]}))
    assert app.handler(_event("GET /api/v1/tracking/viajes"), None)["statusCode"] == 403


def test_list_rejects_a_malformed_cursor(tracking):
    app, _ = tracking
    response = app.handler(_event("GET /api/v1/tracking/viajes", query={"cursor": "x|no-uuid"}), None)
    assert response["statusCode"] == 400


def _plan_trip(**over):
    base = {"id": TRIP, "status": "pending", "delivery_zone": "GAM", "vehicle_id": "veh", "driver_id": "drv",
            "total_weight": 10, "total_volume": 2, "organization_id": ORG, "country_id": "cr",
            "plan_date": date(2026, 10, 16), "plan_status": "confirmed", "carrier_id": "car",
            "vehicle_capacity_weight": 1000}
    base.update(over)
    return base


def test_start_viaje_bridges_plan_trip_into_route_and_guides(tracking):
    app, db = tracking
    db.answer("FROM plan_trips pt", [_plan_trip()])
    db.answer("FROM plan_stops", [{"order_id": "o1", "lat": 9.93, "lng": -84.08},
                                  {"order_id": "o2", "lat": 9.95, "lng": -84.10}])
    db.answer("FROM stores", [{"id": "store-1", "latitude": 9.90, "longitude": -84.05}])
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


def test_ingest_limits(tracking):
    app, _ = tracking
    assert app.handler(_event("POST /api/v1/tracking/posiciones", body={"positions": []}), None)["statusCode"] == 400
    too_many = {"positions": [_pos()] * 201}
    assert app.handler(_event("POST /api/v1/tracking/posiciones", body=too_many), None)["statusCode"] == 400


def _guide_row(**over):
    base = {"id": GUIDE, "route_id": ROUTE, "organization_id": ORG, "order_id": ORDER, "delivery_status": "pending",
            "notes": None, "route_status": "En tránsito", "country_id": "cr", "driver_id": None,
            "stop_lat": None, "stop_lng": None}
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
    assert result == {"stop_id": GUIDE, "state": "delivered", "done": 3, "pending": 1, "distance_m": None}
    assert db.wrote("UPDATE dispatch_guides")[0][1][:2] == ["delivered", "Entregado"]
    assert db.wrote("UPDATE routes SET completed_stops")[0][1] == [3, ROUTE]
    assert db.wrote("INSERT INTO tracking_events")[0][1][3] == "delivery_completed"


def test_closing_the_last_stop_does_not_end_the_trip_nor_touch_planificacion(tracking):
    """Tracking solo monitorea: el viaje lo termina Planificación. Cerrar la última parada no escribe el cierre."""
    app, db = tracking
    db.answer("FROM dispatch_guides g JOIN routes r", [_guide_row()])
    db.answer("FROM dispatch_guides g WHERE g.route_id", [{"done": 4, "pending": 0}])
    app.handler(_event("POST /api/v1/tracking/paradas/{id}/transicion", path={"id": GUIDE},
                       body={"to": "delivered"}), None)
    assert not db.wrote("UPDATE routes SET status")
    assert not any("plan_trips" in sql and sql.startswith(("UPDATE", "INSERT")) for sql, _ in db.calls)


def test_trip_closed_in_planificacion_is_shown_closed_in_tracking(tracking):
    """Solo lectura de plan_trips: completado/cancelado en Planificación = cerrado en Tracking."""
    app, db = tracking
    db.answer("FROM routes r", [])
    app.handler(_event("GET /api/v1/tracking/viajes", query={"activos": "1", "include": "summary"}), None)
    listing = db.wrote("SELECT r.id")[0][0]
    assert "LEFT JOIN plan_trips pt ON pt.id = r.plan_trip_id" in listing
    assert "CASE pt.status WHEN 'completed' THEN 'Completada' WHEN 'cancelled' THEN 'Anulada' ELSE r.status END AS status" in listing
    assert "pt.status NOT IN ('completed', 'cancelled')" in listing  # "Activos" excluye lo terminado en Planificación
    today = [sql for sql, _ in db.calls if sql.startswith("SELECT count(*) AS n")][0]
    assert "COALESCE(r.actual_end_time, CASE WHEN pt.status IN ('completed', 'cancelled') THEN pt.updated_at END)" in today


def test_list_item_of_a_trip_closed_in_planificacion(tracking):
    app, db = tracking
    closed_at = NOW - timedelta(minutes=30)
    db.answer("FROM routes r", [_row(status="Completada", actual_end_time=closed_at)])
    item = body_of(app.handler(_event("GET /api/v1/tracking/viajes"), None))["data"]["items"][0]
    assert item["state"] == "completed" and item["color"] == "blue" and item["ended_at"] == closed_at.isoformat()
    assert not any(a["code"] in ("late", "no_signal", "stopped") for a in item["alerts"])


def test_completar_and_revisar_endpoints_are_gone(tracking):
    app, _ = tracking
    for route in ("POST /api/v1/tracking/viajes/{id}/completar", "POST /api/v1/tracking/viajes/{id}/revisar"):
        assert app.handler(_event(route, path={"id": ROUTE}, body={}), None)["statusCode"] == 404, route


def test_transition_needs_an_active_route(tracking):
    app, db = tracking
    db.answer("FROM dispatch_guides g JOIN routes r", [_guide_row(route_status="Completada")])
    response = app.handler(_event("POST /api/v1/tracking/paradas/{id}/transicion", path={"id": GUIDE},
                                  body={"to": "delivered"}), None)
    assert response["statusCode"] == 409


class FakeS3:
    def __init__(self, head=None):
        self.head, self.calls, self.signed = head, [], []

    def generate_presigned_post(self, bucket, key, **kwargs):
        self.calls.append(("post", key, kwargs))
        return {"url": f"https://{bucket}.s3/", "fields": {"key": key}}

    def head_object(self, Bucket, Key):
        return self.head

    def generate_presigned_url(self, op, Params, ExpiresIn):
        self.signed.append(Params["Key"])
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


# --- ETA, retraso, alertas y semáforo (reglas puras) -----------------------------------------------

def test_plan_schedule_chains_travel_and_service_time(logic):
    stops = [{"lat": 9.93, "lng": -84.08}, {"lat": 9.95, "lng": -84.10}, {"lat": None, "lng": None}]
    plan = logic.plan_schedule((9.90, -84.05), stops, NOW)
    a1, a2, a3 = plan["arrivals"]
    assert NOW < a1 < a2 and a3 - a2 == timedelta(minutes=logic.SERVICE_MIN)  # sin coordenadas: no suma recorrido
    assert plan["end"] == a3 and plan["total_km"] > 0
    assert logic.plan_schedule(None, [{"lat": 9.9, "lng": -84.1}], NOW)["arrivals"] == [NOW]  # sin sede: sin viaje inicial


def test_stop_metrics_orders_pending_stops_and_computes_delay(logic):
    planned = NOW + timedelta(minutes=5)
    stops = [
        {"id": "a", "state": "delivered", "sequence": 1, "lat": 9.9, "lng": -84.0, "planned_arrival": NOW},
        {"id": "c", "state": "pending", "sequence": 3, "lat": 10.2, "lng": -84.2, "planned_arrival": planned},
        {"id": "b", "state": "pending", "sequence": 2, "lat": 9.95, "lng": -84.05, "planned_arrival": planned},
    ]
    result = logic.stop_metrics((9.90, -84.0), stops, NOW)
    assert result["next_stop_id"] == "b" and "a" not in result["by_stop"]
    b, c = result["by_stop"]["b"], result["by_stop"]["c"]
    assert b["distance_m"] > 0 and c["eta_at"] > b["eta_at"] + timedelta(minutes=logic.SERVICE_MIN)
    assert b["delay_min"] == round((b["eta_at"] - planned).total_seconds() / 60)
    assert result["delay_min"] == b["delay_min"]
    assert logic.stop_metrics(None, stops, NOW)["by_stop"]["b"]["distance_m"] is None  # sin posición


def test_departure_uses_a_geofence_around_the_origin(logic):
    origin = (9.90, -84.05)
    assert logic.is_departed(None, origin) is False
    assert logic.is_departed((9.9001, -84.0501), origin) is False       # en la sede
    assert logic.is_departed((9.95, -84.05), origin) is True
    assert logic.is_departed((9.9, -84.05), None) is True                # sin sede geocodificada: basta tener posición
    early = [{"latitude": 9.9, "longitude": -84.05, "recorded_at": NOW},
             {"latitude": 9.95, "longitude": -84.05, "recorded_at": NOW + timedelta(minutes=10)}]
    assert logic.first_departure(early, origin) == NOW + timedelta(minutes=10)


def test_stopped_minutes_counts_time_at_the_same_place(logic):
    still = [{"latitude": 9.9, "longitude": -84.05, "recorded_at": NOW - timedelta(minutes=m)} for m in (30, 20, 10, 0)]
    assert logic.stopped_minutes(still, NOW) == 30
    moving = still[:-1] + [{"latitude": 9.95, "longitude": -84.05, "recorded_at": NOW}]
    assert logic.stopped_minutes(moving, NOW) == 0
    assert logic.stopped_minutes([], NOW) == 0


def _codes(logic, sig="online", failed=0, delay=None, stopped=0):
    return [a["code"] for a in logic.alerts("active", sig, failed, delay, stopped)]

# --- endpoints nuevos ------------------------------------------------------------------------------

def test_start_viaje_saves_planned_times_distance_and_capacity(tracking):
    app, db = tracking
    db.answer("FROM plan_trips pt", [_plan_trip(total_weight=250)])
    db.answer("FROM plan_stops", [{"order_id": "o1", "lat": 9.93, "lng": -84.08},
                                  {"order_id": "o2", "lat": 9.95, "lng": -84.10}])
    db.answer("FROM stores", [{"id": "store-1", "latitude": 9.90, "longitude": -84.05}])
    db.answer("INSERT INTO routes", [{"id": ROUTE}])
    app.handler(_event("POST /api/v1/tracking/viajes/{id}/iniciar", path={"id": TRIP}), None)
    route_params = db.wrote("INSERT INTO routes")[0][1]
    planned_end, km, capacity = route_params[-3:]
    arrivals = [params[-1] for _, params in db.wrote("INSERT INTO dispatch_guides")]
    assert arrivals[0] > NOW and arrivals[1] > arrivals[0] and planned_end == arrivals[1]
    assert km > 0 and capacity == 25.0


# --- app del chofer: aislamiento, mi-viaje, geocerca y devoluciones ------------------------------------

STOP_LAT, STOP_LNG = 9.9300, -84.0800
OTHER_DRIVER = "99999999-9999-4999-8999-999999999999"


def _driver_permissions():
    from tms_common.permissions import Permissions
    return Permissions("app-user", "role-driver", "Chofer", False,
                       {"tracking": frozenset({"view", "create", "edit"})}, True, ())


@pytest.fixture
def driver(tracking, caller_permissions):
    """Quien llama es un Chofer enlazado al conductor DRIVER."""
    app, db = tracking
    caller_permissions.set(_driver_permissions())
    db.answer("FROM drivers WHERE app_user_id", [{"id": DRIVER}])
    return app, db


def test_driver_cannot_use_admin_endpoints(driver):
    app, _ = driver
    for route, path in [("GET /api/v1/tracking/viajes", None), ("GET /api/v1/tracking/resumen", None),
                        ("GET /api/v1/tracking/planificados", None),
                        ("POST /api/v1/tracking/viajes/{id}/iniciar", {"id": TRIP})]:
        assert app.handler(_event(route, path=path), None)["statusCode"] == 403, route


def test_driver_cannot_read_a_trip_of_another_driver(driver):
    app, db = driver
    db.answer("FROM routes r JOIN stores", [{"id": ROUTE, "organization_id": ORG, "status": "En tránsito",
                                              "driver_id": OTHER_DRIVER, "country_id": "cr"}])
    response = app.handler(_event("GET /api/v1/tracking/viajes/{id}", path={"id": ROUTE}), None)
    assert response["statusCode"] == 404
    assert not db.wrote("SELECT r.id, r.route_number")  # ni siquiera se cargó el detalle


def test_driver_positions_of_another_trip_are_rejected_and_not_written(driver):
    app, db = driver
    db.answer("FROM routes r JOIN stores s ON s.id = r.store_id WHERE r.organization_id", [_route_for_ingest(driver_id=OTHER_DRIVER)])
    result = body_of(app.handler(_event("POST /api/v1/tracking/posiciones", body={"positions": [_pos()]}), None))["data"]
    assert result["accepted"] == 0 and result["rejected"][0]["reason"] == "viaje no encontrado"
    assert not db.wrote("INSERT INTO tracking_positions") and not db.wrote("INSERT INTO tracking_last_positions")


def test_driver_can_write_positions_of_own_trip(driver):
    app, db = driver
    good = _pos()
    db.answer("FROM routes r JOIN stores s ON s.id = r.store_id WHERE r.organization_id", [_route_for_ingest(driver_id=DRIVER)])
    db.answer("INSERT INTO tracking_positions", [{"client_id": good["client_id"]}])
    result = body_of(app.handler(_event("POST /api/v1/tracking/posiciones", body={"positions": [good]}), None))["data"]
    assert result["accepted"] == 1 and result["rejected"] == []


def test_driver_without_linked_driver_gets_403(tracking, caller_permissions):
    app, db = tracking
    caller_permissions.set(_driver_permissions())      # sin fila en drivers.app_user_id
    assert app.handler(_event("GET /api/v1/tracking/mi-viaje"), None)["statusCode"] == 403
    db.answer("FROM dispatch_guides g JOIN routes r", [_guide_row()])
    assert app.handler(_event("POST /api/v1/tracking/paradas/{id}/transicion", path={"id": GUIDE},
                              body={"to": "delivered"}), None)["statusCode"] == 403


def test_admin_is_not_restricted_by_driver_link(tracking):
    app, db = tracking
    db.answer("FROM dispatch_guides g JOIN routes r", [_guide_row(driver_id=OTHER_DRIVER)])
    db.answer("FROM dispatch_guides g WHERE g.route_id", [{"done": 1, "pending": 0}])
    response = app.handler(_event("POST /api/v1/tracking/paradas/{id}/transicion", path={"id": GUIDE},
                                  body={"to": "delivered"}), None)
    assert response["statusCode"] == 200 and not db.wrote("SELECT id FROM drivers")


def _delivered(app, **body):
    payload = {"to": "delivered", "receiver_name": "Luis", **body}
    return app.handler(_event("POST /api/v1/tracking/paradas/{id}/transicion", path={"id": GUIDE}, body=payload), None)


def _stop_with_coords(db):
    db.answer("FROM dispatch_guides g JOIN routes r", [_guide_row(stop_lat=STOP_LAT, stop_lng=STOP_LNG)])
    db.answer("FROM dispatch_guides g WHERE g.route_id", [{"done": 1, "pending": 2}])


def test_delivery_within_geofence_stores_distance(tracking):
    app, db = tracking
    _stop_with_coords(db)
    result = body_of(_delivered(app, lat=STOP_LAT + 0.0005, lng=STOP_LNG))["data"]   # ~55 m
    assert 40 <= result["distance_m"] <= 70
    event_row = db.wrote("INSERT INTO tracking_events")
    assert len(event_row) == 1 and event_row[0][1][10] == result["distance_m"]


def test_delivery_far_from_stop_requires_reason(tracking):
    app, db = tracking
    _stop_with_coords(db)
    response = _delivered(app, lat=STOP_LAT + 0.01, lng=STOP_LNG)                      # ~1.1 km
    assert response["statusCode"] == 400 and "motivo" in body_of(response)["error"]["message"]
    assert not db.wrote("UPDATE dispatch_guides")


def test_delivery_without_gps_or_stop_coordinates_is_still_accepted(tracking):
    app, db = tracking
    _stop_with_coords(db)
    assert body_of(_delivered(app))["data"]["distance_m"] is None                       # sin lat/lng del dispositivo
    db.answer("FROM dispatch_guides g JOIN routes r", [_guide_row()])                   # parada sin coordenadas
    assert _delivered(app, lat=9.0, lng=-84.0)["statusCode"] == 200


def test_record_consent_is_idempotent_per_version(driver):
    app, db = driver
    route = "POST /api/v1/tracking/consentimiento-gps"
    assert app.handler(_event(route, body={}), None)["statusCode"] == 400
    db.answer("INSERT INTO tracking_consents", [{"consented_at": NOW}])
    first = app.handler(_event(route, body={"version": "2026-10", "device_id": "dev-1"}), None)
    assert first["statusCode"] == 201 and body_of(first)["data"]["duplicate"] is False
    assert db.wrote("INSERT INTO tracking_consents")[0][1] == [ORG, "app-user", "2026-10", "dev-1"]
    db.answer("INSERT INTO tracking_consents", [])
    db.answer("FROM tracking_consents WHERE", [{"consented_at": NOW}])
    again = app.handler(_event(route, body={"version": "2026-10"}), None)
    assert again["statusCode"] == 200 and body_of(again)["data"]["duplicate"] is True


def test_alerts_only_for_active_trips(logic):
    assert logic.alerts("completed", "offline", 1, 90) == []
    assert _codes(logic) == []
    assert _codes(logic, sig="offline", failed=1, delay=16, stopped=25) == ["failed", "no_signal", "late"]
    assert _codes(logic, delay=15) == []                  # el umbral es estricto
    assert _codes(logic, stopped=25) == ["stopped"]
    assert _codes(logic, sig="stale", stopped=25) == []   # sin señal confiable no se afirma que esté detenido


# --- monitoreo v2: alertas unificadas, lista, detalle, recorrido, ingesta, gzip ------------------------

def _progress(route_id, total=2, delivered=0, failed=0):
    return {"route_id": route_id, "total": total, "delivered": delivered, "failed": failed}


def _full_stop(seq, *, sid=None, lat=9.95, lng=-84.05, planned=None, state="pending", route=ROUTE):
    """Fila de parada con TODAS las columnas de GUIDES_SQL y STOPS_BATCH_SQL."""
    return {"id": sid or f"00000000-0000-4000-8000-00000000000{seq}", "route_id": route, "guide_number": f"G-{seq}",
            "sequence_number": seq, "status": None, "delivery_status": state if state != "pending" else None,
            "actual_arrival_time": None, "planned_arrival_time": planned, "recipient_name": None,
            "order_id": ORDER, "order_number": f"P-{seq}", "invoice_number": f"F-{seq}", "total_items": 3,
            "total_weight": 5, "delivery_address": "Calle 1", "delivery_city": "San José",
            "latitude": lat, "longitude": lng, "customer_name": "Cliente", "customer_phone": "2222-0000"}


LATE_STOP = NOW - timedelta(minutes=30)   # 5.5 km y ~15 min de manejo: ETA NOW+15 → retraso ~45 min


def test_late_rule_is_the_same_in_list_and_detail(tracking):
    app, db = tracking
    row = _row(driver_id=DRIVER)
    db.answer("GROUP BY g.route_id", [_progress(ROUTE)])
    db.answer("SELECT g.route_id, g.id, g.sequence_number", [_full_stop(1, planned=LATE_STOP)])
    db.answer("FROM routes r", [row])
    item = body_of(app.handler(_event("GET /api/v1/tracking/viajes"), None))["data"]["items"][0]
    db.answer("cu.phone AS customer_phone", [_full_stop(1, planned=LATE_STOP)])
    db.answer("FROM routes r JOIN stores s", [row])
    detail = body_of(app.handler(_event("GET /api/v1/tracking/viajes/{id}", path={"id": ROUTE}), None))["data"]
    assert item["delay_min"] == detail["delay_min"] and 45 <= item["delay_min"] <= 55
    assert [a["code"] for a in item["alerts"]] == ["late"] == [a["code"] for a in detail["alerts"]]
    assert detail["next_stop_id"] == detail["stops"][0]["id"]


def test_no_position_means_no_eta_and_no_late_alert(logic):
    stops = logic.stop_inputs([_full_stop(1, planned=LATE_STOP)])
    assert logic.alerts("active", "none", 0, None) == []
    assert stops[0]["state"] == "pending" and stops[0]["planned_arrival"] == LATE_STOP


def test_stopped_is_alerted_in_the_list_from_batched_positions(tracking):
    app, db = tracking
    db.answer("GROUP BY g.route_id", [_progress(ROUTE)])
    db.answer("FROM routes r", [_row()])
    still = [{"route_id": ROUTE, "latitude": 9.9, "longitude": -84.05,
              "recorded_at": NOW - timedelta(minutes=m)} for m in (25, 15, 5, 0)]
    db.answer("recorded_at >= %s::timestamptz", still)
    item = body_of(app.handler(_event("GET /api/v1/tracking/viajes"), None))["data"]["items"][0]
    assert {"code": "stopped", "count": 25} in item["alerts"]
    stopped_query = db.wrote("SELECT route_id, latitude")[0]
    assert "NOT is_mock" in stopped_query[0] and "accuracy_m <= 200" in stopped_query[0]
    assert stopped_query[1][1] == NOW - timedelta(minutes=60)


def test_list_page_uses_a_fixed_number_of_queries(tracking):
    app, db = tracking
    rows = [_row(id=f"00000000-0000-4000-8000-00000000001{i}") for i in range(5)]
    db.answer("GROUP BY g.route_id", [])
    db.answer("FROM routes r", rows)
    app.handler(_event("GET /api/v1/tracking/viajes"), None)
    assert len(db.wrote("SELECT g.route_id, g.id, g.sequence_number")) == 1  # una consulta para las 5 rutas
    assert len([sql for sql, _ in db.calls if "GROUP BY g.route_id" in sql]) == 1


def test_pais_filter_joins_countries_and_intersects_with_the_role(tracking, caller_permissions):
    app, db = tracking
    caller_permissions.set(make_permissions({"tracking": ["view"]}, countries=("cr-id",)))
    db.answer("FROM routes r", [])
    app.handler(_event("GET /api/v1/tracking/viajes", query={"pais": "cr"}), None)
    sql, params = db.wrote("SELECT r.id")[0]
    assert "JOIN countries co ON co.id = s.country_id" in sql and "co.code = 'CR'" in sql
    assert "s.country_id = ANY(ARRAY['cr-id']" in sql  # el rol nunca se amplía


def test_planificados_filters_by_pais_within_the_role(tracking, caller_permissions):
    app, db = tracking
    caller_permissions.set(make_permissions({"tracking": ["view"]}, countries=("cr-id",)))
    db.answer("FROM plan_trips pt", [])
    assert app.handler(_event("GET /api/v1/tracking/planificados", query={"pais": "vn"}), None)["statusCode"] == 200
    sql, params = [c for c in db.calls if "FROM plan_trips pt" in c[0]][0]
    assert "rp.country_id = ANY(" in sql and "FROM countries WHERE code" in sql
    assert "VN" in str(params) or "'VN'" in sql
    assert app.handler(_event("GET /api/v1/tracking/planificados", query={"pais": "V1"}), None)["statusCode"] == 400


def test_pais_outside_the_role_is_still_restricted_and_invalid_codes_are_400(tracking, caller_permissions):
    app, db = tracking
    assert app.handler(_event("GET /api/v1/tracking/viajes", query={"pais": "C1"}), None)["statusCode"] == 400
    caller_permissions.set(make_permissions({"tracking": ["view"]}, countries=("cr-id",)))
    db.answer("FROM routes r", [])
    body = body_of(app.handler(_event("GET /api/v1/tracking/viajes", query={"pais": "VN"}), None))
    assert body["data"]["items"] == [] and "s.country_id = ANY(ARRAY['cr-id']" in db.wrote("SELECT r.id")[0][0]


def test_include_summary_counts_all_active_trips_with_one_query_set(tracking):
    app, db = tracking
    rows = [
        _row(id=ROUTE, last_position_at=NOW - timedelta(seconds=30)),                   # tarde
        _row(id="00000000-0000-4000-8000-000000000021", last_position_at=NOW - timedelta(hours=2)),  # sin señal
        _row(id="00000000-0000-4000-8000-000000000022", last_position_at=NOW - timedelta(seconds=30)),
    ]
    db.answer("count(*) AS n", [{"n": 4}])
    db.answer("GROUP BY g.route_id", [])
    db.answer("SELECT g.route_id, g.id, g.sequence_number", [_full_stop(1, planned=LATE_STOP)])
    db.answer("FROM routes r", rows)
    body = body_of(app.handler(_event("GET /api/v1/tracking/viajes", query={"activos": "1", "limit": "1",
                                                                             "include": "summary"}), None))["data"]
    assert len(body["items"]) == 1 and body["next_cursor"]
    assert body["summary"] == {"active": 3, "on_time": 2, "late": 1, "no_signal": 1, "completed_today": 4}
    completed = db.wrote("SELECT count(*) AS n")[0][0]
    assert "AT TIME ZONE coalesce(co.timezone" in completed and "LIMIT" not in completed


def test_include_summary_only_on_the_first_page(tracking):
    app, db = tracking
    db.answer("FROM routes r", [])
    body = body_of(app.handler(_event("GET /api/v1/tracking/viajes",
                                      query={"include": "summary", "cursor": f"2026-10-16T00:00:00+00:00|{ROUTE}"}),
                               None))["data"]
    assert "summary" not in body


def test_detail_has_contract_fields_and_no_event_or_trail_queries(tracking, monkeypatch):
    app, db = tracking
    monkeypatch.setattr(app, "s3", lambda: FakeS3())
    db.answer("FROM routes r JOIN stores s", [_row(origin_lat=9.9, origin_lng=-84.1, departed_at=NOW - timedelta(hours=1))])
    db.answer("cu.phone AS customer_phone", [_full_stop(1, planned=LATE_STOP)])
    db.answer("FROM tracking_evidences WHERE route_id", [
        {"id": "ev-1", "dispatch_guide_id": "00000000-0000-4000-8000-000000000001", "kind": "photo_invoice",
         "storage_key": "k1", "mime_type": "image/jpeg", "captured_at": NOW}])
    data = body_of(app.handler(_event("GET /api/v1/tracking/viajes/{id}", path={"id": ROUTE}), None))["data"]
    assert data["origin"] == {"lat": 9.9, "lng": -84.1, "name": "Sede"}
    assert data["departed_at"] == (NOW - timedelta(hours=1)).isoformat()
    stop = data["stops"][0]
    assert set(stop) >= {"evidences", "planned_arrival_at", "distance_m", "eta_at", "delay_min", "invoice_number"}
    assert "customer_phone" not in stop and "items" not in stop and "incidents" not in stop
    assert stop["evidences"][0]["url"] == "https://signed/get"
    for gone in ("events", "trail", "incidents", "returns", "review", "carrier_name", "total_distance_km"):
        assert gone not in data
    assert not [sql for sql, _ in db.calls if "tracking_events" in sql or "ORDER BY recorded_at DESC" in sql]


def test_signed_urls_are_cached_and_resigned_near_expiry(tracking, monkeypatch):
    from types import SimpleNamespace
    app, db = tracking
    s3 = FakeS3()
    monkeypatch.setattr(app, "s3", lambda: s3)
    clock = [1_000_000.0]
    monkeypatch.setattr(app, "time", SimpleNamespace(time=lambda: clock[0]))
    db.answer("FROM routes r JOIN stores s", [_row()])
    db.answer("FROM tracking_evidences WHERE route_id", [
        {"id": "ev-1", "dispatch_guide_id": GUIDE, "kind": "signature", "storage_key": "k-stable",
         "mime_type": "image/png", "captured_at": NOW}])
    db.answer("cu.phone AS customer_phone", [_full_stop(1)])
    get = "GET /api/v1/tracking/viajes/{id}"
    app.handler(_event(get, path={"id": ROUTE}), None)
    app.handler(_event(get, path={"id": ROUTE}), None)
    assert s3.signed == ["k-stable"]                       # segunda lectura: misma URL desde caché
    clock[0] += 3600 - 599                                 # quedan 599 s: hay que volver a firmar
    app.handler(_event(get, path={"id": ROUTE}), None)
    assert s3.signed == ["k-stable", "k-stable"]


def test_driver_detail_never_signs_evidence_urls(driver, monkeypatch):
    app, db = driver
    s3 = FakeS3()
    monkeypatch.setattr(app, "s3", lambda: s3)
    db.answer("FROM routes r JOIN stores s", [_row(driver_id=DRIVER)])
    db.answer("FROM tracking_evidences WHERE route_id", [
        {"id": "ev-1", "dispatch_guide_id": "00000000-0000-4000-8000-000000000001", "kind": "signature", "storage_key": "k",
         "mime_type": "image/png", "captured_at": NOW}])
    db.answer("cu.phone AS customer_phone", [_full_stop(1)])
    data = body_of(app.handler(_event("GET /api/v1/tracking/viajes/{id}", path={"id": ROUTE}), None))["data"]
    assert s3.signed == [] and data["stops"][0]["evidences"][0]["url"] is None


def test_recorrido_is_chronological_simplified_and_filters_bad_points(tracking):
    app, db = tracking
    db.answer("FROM routes r JOIN stores s", [_row()])
    line = [{"latitude": 9.9, "longitude": -84.05 + i * 0.0001, "recorded_at": NOW + timedelta(seconds=i * 30)}
            for i in range(10)]
    db.answer("NOT is_mock AND (accuracy_m IS NULL OR accuracy_m <= 200) ORDER BY recorded_at", line)
    data = body_of(app.handler(_event("GET /api/v1/tracking/viajes/{id}/recorrido", path={"id": ROUTE}), None))["data"]
    assert [p["lat"] for p in data["points"]] == [9.9, 9.9]          # recta: solo extremos
    assert data["points"][0]["at"] == line[0]["recorded_at"].isoformat()
    sql, _ = db.wrote("SELECT latitude, longitude, recorded_at FROM tracking_positions WHERE route_id")[0]
    assert "accuracy_m <= 200" in sql


def test_recorrido_access_follows_get_viaje(driver):
    app, db = driver
    db.answer("FROM routes r JOIN stores s", [{"id": ROUTE, "organization_id": ORG, "status": "En tránsito",
                                                "driver_id": OTHER_DRIVER, "country_id": "cr-id"}])
    response = app.handler(_event("GET /api/v1/tracking/viajes/{id}/recorrido", path={"id": ROUTE}), None)
    assert response["statusCode"] == 404 and not [sql for sql, _ in db.calls if "NOT is_mock" in sql]


def test_douglas_peucker_keeps_corners_and_drops_noise(logic):
    base = [(9.9, -84.0 + i * 0.0005) for i in range(5)]
    noise = [{"lat": lat, "lng": lng} for lat, lng in base[:2] + [(9.9 + 0.00004, base[2][1])] + base[3:]]
    assert len(logic.simplify_trail(noise)) == 2                    # 4.4 m de desvío < 15 m
    corner = [{"lat": 9.9, "lng": -84.0}, {"lat": 9.9, "lng": -83.999}, {"lat": 9.9009, "lng": -83.999}]
    kept = logic.simplify_trail(corner)
    assert kept == corner                                           # el giro de ~100 m se conserva


def test_trail_simplification_respects_the_2000_point_cap(logic):
    zigzag = [{"lat": 9.9 + (0.00045 if i % 2 else 0), "lng": -84.0 + i * 0.0001} for i in range(3000)]
    kept = logic.simplify_trail(zigzag)
    assert len(kept) <= logic.TRAIL_MAX_POINTS
    assert kept[0] == zigzag[0] and kept[-1] == zigzag[-1]
    assert logic.simplify_trail(zigzag[:2]) == zigzag[:2]


def test_stopped_by_route_groups_per_route(logic):
    rows = [{"route_id": "r1", "latitude": 9.9, "longitude": -84.05, "recorded_at": NOW - timedelta(minutes=22)},
            {"route_id": "r1", "latitude": 9.9, "longitude": -84.05, "recorded_at": NOW},
            {"route_id": "r2", "latitude": 9.9, "longitude": -84.05, "recorded_at": NOW - timedelta(minutes=3)},
            {"route_id": "r2", "latitude": 9.95, "longitude": -84.05, "recorded_at": NOW}]
    assert logic.stopped_by_route(rows, NOW) == {"r1": 22, "r2": 0}


def test_positions_usable_and_route_grace_rules(logic):
    assert logic.positions_usable(False, None) and logic.positions_usable(False, 200)
    assert not logic.positions_usable(True, 5) and not logic.positions_usable(False, 201)
    assert logic.route_accepts("active", None, NOW)
    assert logic.route_accepts("completed", NOW - timedelta(hours=1, minutes=59), NOW)
    assert not logic.route_accepts("completed", NOW - timedelta(hours=2, minutes=1), NOW)
    assert not logic.route_accepts("completed", None, NOW) and not logic.route_accepts("planned", None, NOW)


def test_alerts_no_signal_only_after_signal_expired(logic):
    assert _codes(logic, sig="offline") == ["no_signal"]
    assert _codes(logic, sig="none") == []                          # nunca hubo GPS: no alerta
    assert _codes(logic, sig="stale") == []


# --- ingesta: gracia, lote, mock, salida de la sede, concurrencia -----------------------------------

def _ids(*values):
    return [{"client_id": v} for v in values]


def test_ingest_stores_rejected_routes_and_moves_last_position_once(tracking):
    app, db = tracking
    good = _pos()
    db.answer("FROM routes r JOIN stores s ON s.id = r.store_id WHERE r.organization_id", [_route_for_ingest()])
    db.answer("INSERT INTO tracking_positions", _ids(good["client_id"]))
    body = {"device_id": "dev-1", "positions": [
        good,
        _pos(client_id="66666666-6666-4666-8666-666666666666", lat=200),
        _pos(client_id="77777777-7777-4777-8777-777777777777", route_id="99999999-9999-4999-8999-999999999999"),
    ]}
    result = body_of(app.handler(_event("POST /api/v1/tracking/posiciones", body=body), None))["data"]
    assert result["accepted"] == 1 and result["duplicates"] == 0
    assert {r["reason"] for r in result["rejected"]} == {"lat fuera de rango", "viaje no encontrado"}
    assert len(db.wrote("INSERT INTO tracking_last_positions")) == 1


def test_ingest_grace_stores_late_points_without_moving_last_position(tracking):
    app, db = tracking
    closed = _route_for_ingest(status="Completada", actual_end_time=NOW - timedelta(hours=1))
    db.answer("FROM routes r JOIN stores s ON s.id = r.store_id WHERE r.organization_id", [closed])
    db.answer("INSERT INTO tracking_positions", _ids(_pos()["client_id"]))
    result = body_of(app.handler(_event("POST /api/v1/tracking/posiciones", body={"positions": [_pos()]}), None))["data"]
    assert result["accepted"] == 1
    assert not db.wrote("INSERT INTO tracking_last_positions")


def test_ingest_rejects_points_after_the_grace_window(tracking):
    app, db = tracking
    old = _route_for_ingest(status="Completada", actual_end_time=NOW - timedelta(hours=3))
    db.answer("FROM routes r JOIN stores s ON s.id = r.store_id WHERE r.organization_id", [old])
    result = body_of(app.handler(_event("POST /api/v1/tracking/posiciones", body={"positions": [_pos()]}), None))["data"]
    assert result["accepted"] == 0 and result["rejected"][0]["reason"] == "viaje no activo"
    assert not db.wrote("INSERT INTO tracking_positions")


def test_ingest_batches_last_positions_into_one_statement(tracking):
    app, db = tracking
    r1, r2 = ROUTE, "99999999-9999-4999-8999-999999999999"
    db.answer("FROM routes r JOIN stores s ON s.id = r.store_id WHERE r.organization_id",
              [_route_for_ingest(), _route_for_ingest(id=r2)])
    batch = [_pos(client_id=f"aaaaaaaa-aaaa-4aaa-8aaa-00000000000{i}", route_id=r1 if i < 2 else r2,
                  recorded_at=f"2026-10-16T14:5{i}:00Z") for i in range(4)]
    db.answer("INSERT INTO tracking_positions", _ids(*[p["client_id"] for p in batch]))
    result = body_of(app.handler(_event("POST /api/v1/tracking/posiciones", body={"positions": batch}), None))["data"]
    assert result["accepted"] == 4
    upserts = db.wrote("INSERT INTO tracking_last_positions")
    assert len(upserts) == 1 and len(upserts[0][1]) == 16        # 2 viajes x 8 columnas, una sentencia
    assert upserts[0][1][0] == r1 and upserts[0][1][8] == r2   # un viaje por bloque de 8 columnas


def test_ingest_mock_and_low_accuracy_points_are_stored_but_do_not_move_position(tracking):
    app, db = tracking
    db.answer("FROM routes r JOIN stores s ON s.id = r.store_id WHERE r.organization_id", [_route_for_ingest()])
    mock = _pos(is_mock=True)
    poor = _pos(client_id="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", accuracy_m=500)
    db.answer("INSERT INTO tracking_positions", _ids(mock["client_id"], poor["client_id"]))
    result = body_of(app.handler(_event("POST /api/v1/tracking/posiciones", body={"positions": [mock, poor]}), None))["data"]
    assert result["accepted"] == 2
    stored = db.wrote("INSERT INTO tracking_positions")[0][1]
    assert stored.count(True) == 1                                 # is_mock queda marcado en la fila
    assert not db.wrote("INSERT INTO tracking_last_positions")


def test_ingest_sets_departed_at_on_first_point_far_from_the_store(tracking):
    app, db = tracking
    route = _route_for_ingest(origin_lat=9.90, origin_lng=-84.05)
    db.answer("FROM routes r JOIN stores s ON s.id = r.store_id WHERE r.organization_id", [route])
    near = _pos(lat=9.9001, lng=-84.0501, recorded_at="2026-10-16T14:50:00Z")
    far = _pos(client_id="cccccccc-cccc-4ccc-8ccc-cccccccccccc", lat=9.95, lng=-84.05, recorded_at="2026-10-16T14:55:00Z")
    db.answer("INSERT INTO tracking_positions", _ids(near["client_id"], far["client_id"]))
    app.handler(_event("POST /api/v1/tracking/posiciones", body={"positions": [far, near]}), None)
    departed = db.wrote("UPDATE routes SET departed_at")
    assert len(departed) == 1 and departed[0][1][1] == ROUTE
    assert departed[0][1][0].isoformat() == "2026-10-16T14:55:00+00:00"


def test_ingest_does_not_overwrite_an_existing_departure(tracking):
    app, db = tracking
    route = _route_for_ingest(origin_lat=9.90, origin_lng=-84.05, departed_at=NOW - timedelta(hours=1))
    db.answer("FROM routes r JOIN stores s ON s.id = r.store_id WHERE r.organization_id", [route])
    db.answer("INSERT INTO tracking_positions", _ids(_pos()["client_id"]))
    app.handler(_event("POST /api/v1/tracking/posiciones", body={"positions": [_pos(lat=9.95)]}), None)
    assert not db.wrote("UPDATE routes SET departed_at")


def test_start_viaje_concurrent_duplicate_returns_the_existing_route(tracking, monkeypatch):
    from tms_common import pg
    app, db = tracking

    def lost_race(work, retries=0):
        raise HttpError(409, "duplicate key value violates unique constraint", code="23505")

    monkeypatch.setattr(pg, "run_in_transaction", lost_race)
    db.answer("SELECT id FROM routes WHERE plan_trip_id", [{"id": ROUTE}])
    response = app.handler(_event("POST /api/v1/tracking/viajes/{id}/iniciar", path={"id": TRIP}), None)
    assert response["statusCode"] == 200 and body_of(response)["data"] == {"route_id": ROUTE, "created": False}


def test_start_viaje_other_conflicts_are_not_swallowed(tracking, monkeypatch):
    from tms_common import pg
    app, db = tracking

    def other(work, retries=0):
        raise HttpError(409, "otra restricción", code="23503")

    monkeypatch.setattr(pg, "run_in_transaction", other)
    db.answer("SELECT id FROM routes WHERE plan_trip_id", [])
    assert app.handler(_event("POST /api/v1/tracking/viajes/{id}/iniciar", path={"id": TRIP}), None)["statusCode"] == 409


# --- transición, evidencias y endpoints retirados -------------------------------------------------

def test_geofence_outside_is_recorded_as_geofence_out_not_incident(tracking):
    app, db = tracking
    _stop_with_coords(db)
    response = _delivered(app, lat=STOP_LAT + 0.01, lng=STOP_LNG, reason="No se podía estacionar")
    assert response["statusCode"] == 200
    events = db.wrote("INSERT INTO tracking_events")
    assert [e[1][3] for e in events] == ["delivery_completed", "geofence_out"]
    assert "incident" not in [e[1][3] for e in events]


def test_upload_url_rejects_photo_other_with_422(tracking, monkeypatch):
    app, _ = tracking
    monkeypatch.setattr(app, "s3", lambda: FakeS3())
    body = {"kind": "photo_other", "mime_type": "image/jpeg"}
    response = app.handler(_event("POST /api/v1/tracking/paradas/{id}/evidencias/upload-url", path={"id": GUIDE},
                                  body=body), None)
    assert response["statusCode"] == 422


def test_removed_endpoints_are_gone():
    app = load_stack_module("tracking")
    assert not [k for k in app.ROUTES if "novedades" in k or "devoluciones" in k]
    assert "GET /api/v1/tracking/viajes/{id}/recorrido" in app.ROUTES
    assert "GET /api/v1/tracking/resumen" in app.ROUTES        # deprecado, sigue vivo


def test_driver_cannot_close_a_stop_of_another_driver(driver):
    app, db = driver
    db.answer("FROM dispatch_guides g JOIN routes r", [_guide_row(driver_id=OTHER_DRIVER)])
    response = app.handler(_event("POST /api/v1/tracking/paradas/{id}/transicion", path={"id": GUIDE},
                                  body={"to": "delivered"}), None)
    assert response["statusCode"] == 404
    assert not db.wrote("UPDATE dispatch_guides") and not db.wrote("INSERT INTO tracking_events")


def test_mi_viaje_keeps_contact_for_the_driver_and_lists_planned_trips(driver):
    app, db = driver
    db.answer("WHERE r.organization_id = %s AND r.driver_id", [_row(driver_id=DRIVER)])
    db.answer("FROM routes r JOIN stores s", [_row(driver_id=DRIVER)])
    db.answer("FROM plan_trips pt", [{"plan_trip_id": TRIP, "plan_date": date(2026, 10, 16), "delivery_zone": "GAM",
                                      "plate": "XYZ789", "driver_name": "Ana", "total_weight": 10,
                                      "sequence_order": 1}])
    db.answer("FROM plan_stops ps JOIN orders o", [{
        "trip_id": TRIP, "stop_order": 1, "order_id": ORDER, "order_number": "P-1", "invoice_number": "F-1",
        "total_items": 3, "total_weight": 5, "delivery_address": "Calle 1", "delivery_city": "San José",
        "latitude": STOP_LAT, "longitude": STOP_LNG, "customer_name": "Cliente", "customer_phone": "2222-0000"}])
    db.answer("cu.phone AS customer_phone", [_full_stop(1)])
    result = body_of(app.handler(_event("GET /api/v1/tracking/mi-viaje"), None))["data"]
    assert [item["kind"] for item in result["items"]] == ["route", "planned"]
    route_item = result["items"][0]
    assert route_item["stops"][0]["customer_phone"] == "2222-0000" and route_item["stops"][0]["items"] == 3
    assert result["items"][1]["stops"][0]["customer_phone"] == "2222-0000"
    mine = [c for c in db.calls if "r.driver_id = %s" in c[0]]
    assert mine and mine[0][1][:2] == [ORG, DRIVER]


# --- gzip ----------------------------------------------------------------------------------------

def test_gzip_only_when_accepted_and_large_enough(tracking):
    import base64
    import gzip
    import json as jsonlib
    app, db = tracking
    db.answer("FROM routes r", [_row(id=f"00000000-0000-4000-8000-00000000001{i}") for i in range(12)])
    event = _event("GET /api/v1/tracking/viajes")
    plain = app.handler(event, None)
    assert "Content-Encoding" not in plain["headers"] and "isBase64Encoded" not in plain
    event["headers"] = {"Accept-Encoding": "gzip, deflate, br"}
    packed = app.handler(event, None)
    assert packed["isBase64Encoded"] is True and packed["headers"]["Content-Encoding"] == "gzip"
    data = jsonlib.loads(gzip.decompress(base64.b64decode(packed["body"])))
    assert len(data["data"]["items"]) == 12
    assert len(packed["body"]) < len(plain["body"])


def test_gzip_skips_small_bodies_and_other_encodings(logic):
    app = load_stack_module("tracking")
    small = {"statusCode": 200, "headers": {"Content-Type": "application/json"}, "body": "{}"}
    big = {"statusCode": 200, "headers": {"Content-Type": "application/json"}, "body": "x" * 5000}
    assert app._gzip_response({"headers": {"accept-encoding": "gzip"}}, small) is small
    assert app._gzip_response({"headers": {"accept-encoding": "br"}}, big) is big
    assert app._gzip_response({}, big) is big
    assert app._gzip_response({"headers": {"Accept-Encoding": "gzip"}}, big)["isBase64Encoded"] is True
