"""Devoluciones: recepción por viaje y formulario (backend/admin/src/admin_returns.py)."""

from contextlib import contextmanager
from datetime import datetime, timezone

import pytest

from conftest import body_of, http_event, load_stack_module, make_permissions
from tms_common import pg

USER = {"id": "auth-1", "email": "bodega@ologistics.com"}
ORG, ROUTE, RETURN, GUIDE, COUNTRY = "org-1", "route-1", "ret-1", "guide-1", "country-1"
READER = make_permissions({"devoluciones": ["view"]})
RECEIVER = make_permissions({"devoluciones": ["view", "edit"]})


class FakeDb:
    """Doble de Aurora: responde por fragmento de SQL y registra cada sentencia."""

    def __init__(self):
        self.calls: list[tuple[str, list]] = []
        self.trip = {"route_id": ROUTE, "route_number": "R-1", "total_returns": 2, "received_returns": 0,
                     "pending_returns": 2, "carrier_name": "Transportes S.A.", "driver_name": "Luis"}
        self.return_row: dict | None = {"id": RETURN, "quantity": 3, "status": "pending", "route_id": ROUTE}
        self.form: dict | None = None
        self.guides = [{"id": GUIDE}]
        self.next_number = 1
        self.received_all = [{"id": "a"}, {"id": "b"}]

    def query(self, sql, params=()):
        self.calls.append((sql, list(params)))
        if "FROM tbl_app_users WHERE id" in sql:
            return [{"organization_id": ORG}]
        if "FROM vw_return_trips" in sql and "count(*)::int AS trips" in sql:
            return [{"trips": 1, "trips_pending": 1, "trips_ready": 0, "returns_total": 2,
                     "returns_pending": 2, "returns_received": 0}]
        if "FROM vw_return_trips" in sql:
            return [self.trip] if self.trip and ("WHERE route_id" in sql or "ORDER BY" in sql) else []
        if sql.lstrip().startswith("SELECT rt.id, rt.quantity"):
            return [self.return_row] if self.return_row else []
        if sql.lstrip().startswith("UPDATE tbl_returns\nSET status = 'received'"):
            return [{"id": params[3], "status": "received", "received_quantity": params[1]}]
        if sql.lstrip().startswith("UPDATE tbl_returns rt"):
            return self.received_all
        if "FROM tbl_return_forms WHERE route_id" in sql:
            return [self.form] if self.form else []
        if "FROM tbl_dispatch_guides g\nWHERE g.route_id" in sql:
            return self.guides
        if sql.lstrip().startswith("UPDATE tbl_return_forms"):
            return [{"id": "form-1", "form_number": self.form["form_number"]}] if self.form else []
        if "AS next FROM tbl_return_forms" in sql.replace("\n", " "):
            return [{"next": self.next_number}]
        if sql.lstrip().startswith("INSERT INTO tbl_return_forms"):
            return [{"id": "form-1", "form_number": params[2]}]
        return []

    @contextmanager
    def transaction(self):
        yield self.query


@pytest.fixture
def db(monkeypatch):
    fake = FakeDb()
    monkeypatch.setattr(pg, "query", fake.query)
    monkeypatch.setattr(pg, "transaction", fake.transaction)
    return fake


@pytest.fixture
def app(db):
    return load_stack_module("admin")


def call(app, route, *, path=None, query=None, body=None):
    return app.handler(http_event(route, path=path, query=query, body=body, user=USER), None)


def writes(db, fragment):
    return [params for sql, params in db.calls if fragment in sql]


def test_reading_requires_the_devoluciones_view_permission(app, caller_permissions):
    caller_permissions.set(make_permissions({"tarifas": "*"}))
    assert call(app, "GET /api/v1/devoluciones/viajes")["statusCode"] == 403


def test_summary_and_trip_list_for_a_reader(app, caller_permissions):
    caller_permissions.set(READER)
    assert body_of(call(app, "GET /api/v1/devoluciones/resumen"))["data"]["trips_pending"] == 1
    trips = body_of(call(app, "GET /api/v1/devoluciones/viajes", query={"estado": "pendientes"}))["data"]
    assert trips[0]["route_id"] == ROUTE


def test_trip_list_rejects_an_unknown_state_and_a_bad_date(app, caller_permissions):
    caller_permissions.set(READER)
    assert call(app, "GET /api/v1/devoluciones/viajes", query={"estado": "otro"})["statusCode"] == 400
    assert call(app, "GET /api/v1/devoluciones/viajes", query={"desde": "31/12/2026"})["statusCode"] == 400


def test_a_role_limited_to_some_countries_filters_every_read_by_them(app, db, caller_permissions):
    caller_permissions.set(make_permissions({"devoluciones": ["view"]}, countries=[COUNTRY]))
    call(app, "GET /api/v1/devoluciones/viajes")
    sql, params = next(c for c in db.calls if "FROM vw_return_trips" in c[0] and "ORDER BY" in c[0])
    assert "country_id = ANY(%s::uuid[])" in sql and params[-1] == [COUNTRY]


def test_a_trip_outside_the_role_countries_is_not_found(app, db, caller_permissions):
    caller_permissions.set(make_permissions({"devoluciones": ["view"]}, countries=[COUNTRY]))
    db.trip = None
    assert call(app, "GET /api/v1/devoluciones/viajes/{routeId}", path={"routeId": ROUTE})["statusCode"] == 404


def test_trip_detail_includes_returns_sections_form_and_default_transport(app, caller_permissions):
    caller_permissions.set(READER)
    data = body_of(call(app, "GET /api/v1/devoluciones/viajes/{routeId}", path={"routeId": ROUTE}))["data"]
    assert data["trip"]["route_id"] == ROUTE and data["form"] is None
    assert data["defaults"]["transport"] == "Transportes S.A. - Luis"


def test_receiving_a_return_defaults_to_the_reported_quantity_and_is_audited(app, db, caller_permissions, audit_calls):
    caller_permissions.set(RECEIVER)
    response = call(app, "POST /api/v1/devoluciones/{returnId}/recibir", path={"returnId": RETURN}, body={})
    assert response["statusCode"] == 200
    assert body_of(response)["data"]["return"]["received_quantity"] == 3
    update = writes(db, "SET status = 'received'")[0]
    assert update[1:3] == [3, "Bueno"] and update[0] == "app-user"
    assert any(c[0] == "record" and c[2]["metadata"]["action"] == "recibir" for c in audit_calls)


def test_receiving_with_a_different_quantity_and_condition(app, db, caller_permissions):
    caller_permissions.set(RECEIVER)
    call(app, "POST /api/v1/devoluciones/{returnId}/recibir", path={"returnId": RETURN},
         body={"received_quantity": 1, "condition": "Dañado"})
    assert writes(db, "SET status = 'received'")[0][1:3] == [1, "Dañado"]


@pytest.mark.parametrize("body", [{"received_quantity": -1}, {"received_quantity": "2"}, {"condition": "Roto"}])
def test_receiving_rejects_invalid_quantity_or_condition(app, db, caller_permissions, body):
    caller_permissions.set(RECEIVER)
    response = call(app, "POST /api/v1/devoluciones/{returnId}/recibir", path={"returnId": RETURN}, body=body)
    assert response["statusCode"] == 400 and not writes(db, "SET status = 'received'")


def test_receiving_twice_does_not_overwrite_who_and_when(app, db, caller_permissions, audit_calls):
    caller_permissions.set(RECEIVER)
    db.return_row["status"] = "received"
    response = call(app, "POST /api/v1/devoluciones/{returnId}/recibir", path={"returnId": RETURN}, body={})
    assert response["statusCode"] == 200 and not writes(db, "SET status = 'received'")
    assert not [c for c in audit_calls if c[0] == "record"]


@pytest.mark.parametrize("status", ["rejected", "cancelled"])
def test_a_rejected_or_cancelled_return_cannot_be_received(app, db, caller_permissions, status):
    caller_permissions.set(RECEIVER)
    db.return_row["status"] = status
    assert call(app, "POST /api/v1/devoluciones/{returnId}/recibir", path={"returnId": RETURN},
                body={})["statusCode"] == 409


def test_a_reader_cannot_receive(app, db, caller_permissions):
    caller_permissions.set(READER)
    assert call(app, "POST /api/v1/devoluciones/{returnId}/recibir", path={"returnId": RETURN},
                body={})["statusCode"] == 403
    assert not writes(db, "SET status = 'received'")


def test_receiving_an_unknown_return_is_a_404(app, db, caller_permissions):
    caller_permissions.set(RECEIVER)
    db.return_row = None
    assert call(app, "POST /api/v1/devoluciones/{returnId}/recibir", path={"returnId": "x"},
                body={})["statusCode"] == 404


def test_receive_all_marks_only_the_open_returns_of_the_trip(app, db, caller_permissions):
    caller_permissions.set(RECEIVER)
    response = call(app, "POST /api/v1/devoluciones/viajes/{routeId}/recibir-todas", path={"routeId": ROUTE}, body={})
    assert body_of(response)["data"]["received"] == 2
    sql = next(s for s, _ in db.calls if s.lstrip().startswith("UPDATE tbl_returns rt"))
    assert "IN ('pending', 'approved')" in sql


def test_saving_the_form_for_the_first_time_generates_the_number_of_the_month(app, db, caller_permissions):
    caller_permissions.set(RECEIVER)
    db.next_number = 7
    body = {"return_kind": "devolucion", "observations": "Lámina dañada",
            "sections": [{"dispatch_guide_id": GUIDE, "invoice_number": "897062", "customer_name": "Cliente"}]}
    assert call(app, "PUT /api/v1/devoluciones/viajes/{routeId}/formulario", path={"routeId": ROUTE},
                body=body)["statusCode"] == 200
    created = writes(db, "INSERT INTO tbl_return_forms")[0]
    assert created[2] == f"DEV-{datetime.now(timezone.utc):%Y-%m}-0007" and created[1] == ROUTE
    assert writes(db, "INSERT INTO tbl_return_form_sections")[0][1:3] == [GUIDE, 0]


def test_saving_an_existing_form_keeps_its_number(app, db, caller_permissions):
    caller_permissions.set(RECEIVER)
    db.form = {"id": "form-1", "form_number": "DEV-2026-10-0001"}
    call(app, "PUT /api/v1/devoluciones/viajes/{routeId}/formulario", path={"routeId": ROUTE},
         body={"comments": "ok"})
    assert not writes(db, "INSERT INTO tbl_return_forms")


@pytest.mark.parametrize("body", [
    {"return_kind": "regalo"},
    {"sections": [{"dispatch_guide_id": "otra-parada"}]},
    {"branch": "x" * 101},
    {"received_date": "ayer"},
])
def test_saving_the_form_validates_its_input(app, db, caller_permissions, body):
    caller_permissions.set(RECEIVER)
    response = call(app, "PUT /api/v1/devoluciones/viajes/{routeId}/formulario", path={"routeId": ROUTE}, body=body)
    assert response["statusCode"] == 400 and not writes(db, "INSERT INTO tbl_return_forms")
