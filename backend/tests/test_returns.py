"""Devoluciones: recepción por viaje y formulario (backend/admin/src/admin_returns.py)."""

from contextlib import contextmanager
from datetime import date, datetime, timezone
import base64
import json
import re
import sqlite3

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
        self.forms_list: list = []
        self.guides = [{"id": GUIDE}]
        self.selected = [{"id": RETURN, "dispatch_guide_id": GUIDE, "form_id": None}]
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
        if sql.lstrip().startswith("UPDATE tbl_returns\nSET status = 'rejected'"):
            return [{"id": params[2], "status": "rejected", "rejection_reason": params[0]}]
        if sql.lstrip().startswith("UPDATE tbl_returns rt"):
            return self.received_all
        if sql.lstrip().startswith("SELECT * FROM tbl_return_forms WHERE id"):
            return [self.form] if self.form else []
        if sql.lstrip().startswith("SELECT f.id, f.form_number, f.created_at"):
            return self.forms_list
        if sql.lstrip().startswith("SELECT rt.id, rt.dispatch_guide_id, i.form_id"):
            return self.selected
        if sql.lstrip().startswith("SELECT DISTINCT rt.dispatch_guide_id"):
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
    assert "country_id = ANY(%s::uuid[])" in sql and params[-2] == [COUNTRY]


@pytest.fixture
def trips_database(monkeypatch):
    """Ejecuta la consulta de paginación sobre filas reales locales, sin conexión a Aurora.

    Solo adapta placeholders, casts y ANY al dialecto SQLite. La comparación
    de claves y el ORDER BY los ejecuta SQL, no un doble que imite el cursor.
    """
    connection = sqlite3.connect(":memory:")
    connection.row_factory = sqlite3.Row
    connection.execute("CREATE TABLE vw_return_trips (route_id TEXT, route_date TEXT, route_number TEXT, "
                       "organization_id TEXT, country_id TEXT, pending_returns INTEGER, open_returns INTEGER, incident_returns INTEGER)")
    rows = [{"route_id": f"11111111-1111-4111-8111-{index:012d}",
             "route_date": None if index % 11 == 0 else "2026-11-12",
             "route_number": None if index % 7 == 0 else "R-1",
             "organization_id": ORG, "country_id": COUNTRY if index % 5 else "other-country",
             "pending_returns": index % 3, "open_returns": index % 3, "incident_returns": 0} for index in range(1201)]
    connection.executemany("INSERT INTO vw_return_trips VALUES (:route_id, :route_date, :route_number, "
                           ":organization_id, :country_id, :pending_returns, :open_returns, :incident_returns)", rows)
    original = pg.query

    def query(statement, params=()):
        if "FROM vw_return_trips" not in statement:
            return original(statement, params)
        bound = []
        for value in params:
            if isinstance(value, list):
                statement = statement.replace("= ANY(%s::uuid[])", "IN (" + ",".join(["%s"] * len(value)) + ")", 1)
                bound.extend(value)
            else:
                bound.append(value.isoformat() if isinstance(value, date) else value)
        statement = re.sub(r"::(?:uuid|boolean|date|text|int)", "", statement)
        statement = statement.replace("DATE '0001-01-01'", "'0001-01-01'").replace("%s", "?")
        return [dict(row) for row in connection.execute(statement, bound)]

    monkeypatch.setattr(pg, "query", query)
    yield rows
    connection.close()


def _all_trip_pages(app, query):
    cursor, rows = None, []
    for _ in range(100):
        response = call(app, "GET /api/v1/devoluciones/viajes", query={**query, **({"cursor": cursor} if cursor else {})})
        assert response["statusCode"] == 200, body_of(response)
        body = body_of(response)
        rows.extend(body["data"])
        cursor = body.get("next_cursor")
        if cursor is None:
            return rows
    pytest.fail("La paginación no termina")


def test_trip_pages_reach_every_row_past_500_with_tied_and_null_keys(app, trips_database, caller_permissions):
    caller_permissions.set(READER)
    rows = _all_trip_pages(app, {"limit": "100"})
    assert len(rows) == len(trips_database) == len({row["route_id"] for row in rows})
    ordered = sorted(trips_database, key=lambda row: (
        row["route_date"] is None, row["route_date"] or "0001-01-01",
        row["route_number"] is None, row["route_number"] or "", row["route_id"]), reverse=True)
    assert [row["route_id"] for row in rows] == [row["route_id"] for row in ordered]


@pytest.mark.parametrize("state", ["pendientes", "recibidos"])
def test_trip_pagination_keeps_country_dates_and_state_on_every_page(app, trips_database, caller_permissions, state):
    caller_permissions.set(make_permissions({"devoluciones": ["view"]}, countries=[COUNTRY]))
    rows = _all_trip_pages(app, {"limit": "17", "estado": state, "desde": "2026-11-01", "hasta": "2026-11-30"})
    expected = [row for row in trips_database if row["country_id"] == COUNTRY and row["route_date"] is not None
                and ((row["pending_returns"] > 0) == (state == "pendientes"))]
    assert {row["route_id"] for row in rows} == {row["route_id"] for row in expected}
    assert len(rows) == len(expected)


def test_legacy_trip_list_still_returns_an_array_of_at_most_500(app, trips_database, caller_permissions):
    caller_permissions.set(READER)
    body = body_of(call(app, "GET /api/v1/devoluciones/viajes"))
    assert isinstance(body["data"], list) and len(body["data"]) == 500
    assert body.get("next_cursor")


@pytest.mark.parametrize("query", [{"limit": value} for value in ("0", "-1", "501", "1.5", "x", "9" * 5000)] + [
    {"cursor": "not-a-cursor"}, {"cursor": "e30"}, {"cursor": "x" * 2049},
])
def test_trip_pagination_rejects_invalid_parameters(app, caller_permissions, query):
    caller_permissions.set(READER)
    assert call(app, "GET /api/v1/devoluciones/viajes", query=query)["statusCode"] == 400


@pytest.mark.parametrize("number", ["R\x00invalid", "R\ud800invalid"])
def test_trip_cursor_rejects_text_postgres_cannot_store(app, caller_permissions, number):
    caller_permissions.set(READER)
    cursor = base64.urlsafe_b64encode(json.dumps(["2026-11-12", number, "11111111-1111-4111-8111-111111111111"]).encode()).decode()
    assert call(app, "GET /api/v1/devoluciones/viajes", query={"cursor": cursor})["statusCode"] == 400


def test_a_trip_outside_the_role_countries_is_not_found(app, db, caller_permissions):
    caller_permissions.set(make_permissions({"devoluciones": ["view"]}, countries=[COUNTRY]))
    db.trip = None
    assert call(app, "GET /api/v1/devoluciones/viajes/{routeId}", path={"routeId": ROUTE})["statusCode"] == 404


def test_trip_detail_includes_returns_sections_forms_and_default_transport(app, db, caller_permissions):
    caller_permissions.set(READER)
    db.forms_list = [{"id": "form-1", "form_number": "DEV-2026-11-0001", "returns_count": 2}]
    data = body_of(call(app, "GET /api/v1/devoluciones/viajes/{routeId}", path={"routeId": ROUTE}))["data"]
    assert data["trip"]["route_id"] == ROUTE and data["forms"][0]["form_number"] == "DEV-2026-11-0001"
    assert "form" not in data
    assert data["defaults"]["transport"] == "Transportes S.A. - Luis"


def test_trip_detail_signs_the_photo_of_each_return(app, db, caller_permissions, monkeypatch):
    import admin_media
    key = f"pedidos/PED-1/{'a' * 8}-aaaa-4aaa-8aaa-{'a' * 12}/photo_return-{'b' * 8}-bbbb-4bbb-8bbb-{'b' * 12}.jpg"
    lines = [{"id": RETURN, "return_type": "contracamion", "photo_url": key}, {"id": "r2", "photo_url": None}]
    real = db.query
    monkeypatch.setattr(pg, "query", lambda sql, params=(): lines if "SELECT rt.id, rt.return_number" in sql
                        else real(sql, params))
    monkeypatch.setattr(admin_media, "signed_photo_url", lambda k: f"https://s3/signed?k={k}" if k else None)
    caller_permissions.set(READER)
    data = body_of(call(app, "GET /api/v1/devoluciones/viajes/{routeId}", path={"routeId": ROUTE}))["data"]
    assert data["returns"][0]["photo_url"] == f"https://s3/signed?k={key}" and data["returns"][0]["return_type"] == "contracamion"
    assert data["returns"][1]["photo_url"] is None


def test_signed_photo_url_ignores_foreign_keys_and_a_missing_bucket(monkeypatch):
    import admin_media
    monkeypatch.delenv("MOBILE_EVIDENCE_BUCKET", raising=False)
    assert admin_media.signed_photo_url("pedidos/x/y/z.jpg") is None
    monkeypatch.setenv("MOBILE_EVIDENCE_BUCKET", "bucket")
    assert admin_media.signed_photo_url("../secreto.jpg") is None and admin_media.signed_photo_url(None) is None


def test_receiving_a_return_defaults_to_the_reported_quantity_and_is_audited(app, db, caller_permissions, audit_calls):
    caller_permissions.set(RECEIVER)
    response = call(app, "POST /api/v1/devoluciones/{returnId}/recibir", path={"returnId": RETURN}, body={})
    assert response["statusCode"] == 200
    assert body_of(response)["data"]["return"]["received_quantity"] == 3
    update = writes(db, "SET status = 'received'")[0]
    assert update[1:3] == [3, "Bueno"] and update[0] == "app-user"
    assert any(c[0] == "record" and c[2]["metadata"]["action"] == "recibir" for c in audit_calls)


def test_incomplete_or_damaged_receipt_requires_a_text_incident(app, db, caller_permissions):
    caller_permissions.set(RECEIVER)
    response = call(app, "POST /api/v1/devoluciones/{returnId}/recibir", path={"returnId": RETURN},
         body={"received_quantity": 1, "condition": "Dañado"})
    assert response['statusCode'] == 400
    assert not writes(db, "SET status = 'received'")


def test_receive_all_cannot_accept_damaged_goods_without_incident_text(app, db, caller_permissions):
    caller_permissions.set(RECEIVER)
    response = call(app, "POST /api/v1/devoluciones/viajes/{routeId}/recibir-todas", path={"routeId": ROUTE}, body={"condition":"Dañado"})
    assert response['statusCode'] == 400
    assert not writes(db, "UPDATE tbl_returns")


@pytest.mark.parametrize("body", [{"received_quantity": -1}, {"received_quantity": "2"}, {"condition": "Roto"},
                                  {"received_quantity": 2147483648}])
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


def _create(app, body, route=ROUTE):
    return call(app, "POST /api/v1/devoluciones/viajes/{routeId}/formularios", path={"routeId": route}, body=body)


def test_creating_a_form_with_the_checked_returns_generates_the_number_of_the_month(app, db, caller_permissions, audit_calls):
    caller_permissions.set(RECEIVER)
    db.next_number = 7
    db.form = {"id": "form-1", "form_number": "DEV-X", "route_id": ROUTE}
    body = {"return_ids": [RETURN], "return_kind": "devolucion", "observations": "Lámina dañada",
            "sections": [{"dispatch_guide_id": GUIDE, "invoice_number": "897062", "customer_name": "Cliente"}]}
    assert _create(app, body)["statusCode"] == 200
    created = writes(db, "INSERT INTO tbl_return_forms")[0]
    assert created[2] == f"DEV-{datetime.now(timezone.utc):%Y-%m}-0007" and created[1] == ROUTE
    assert writes(db, "INSERT INTO tbl_return_form_items")[0] == ["form-1", RETURN]
    assert writes(db, "INSERT INTO tbl_return_form_sections")[0][1:3] == [GUIDE, 0]
    assert any(c[0] == "record" and c[1] == "create" and c[2]["metadata"]["returns"] == 1 for c in audit_calls)


def test_a_form_only_gets_the_checked_returns_not_the_whole_trip(app, db, caller_permissions):
    caller_permissions.set(RECEIVER)
    db.selected = [{"id": "r1", "dispatch_guide_id": GUIDE, "form_id": None}, {"id": "r2", "dispatch_guide_id": GUIDE, "form_id": None}]
    db.form = {"id": "form-1", "form_number": "DEV-X", "route_id": ROUTE}
    _create(app, {"return_ids": ["r1", "r2"]})
    assert [p[1] for p in writes(db, "INSERT INTO tbl_return_form_items")] == ["r1", "r2"]


@pytest.mark.parametrize("body", [{}, {"return_ids": []}, {"return_ids": "r1"}])
def test_creating_a_form_requires_at_least_one_checked_return(app, db, caller_permissions, body):
    caller_permissions.set(RECEIVER)
    assert _create(app, body)["statusCode"] == 400 and not writes(db, "INSERT INTO tbl_return_forms")


def test_a_return_that_is_not_of_the_trip_is_rejected(app, db, caller_permissions):
    caller_permissions.set(RECEIVER)
    assert _create(app, {"return_ids": [RETURN, "ajena"]})["statusCode"] == 400
    assert not writes(db, "INSERT INTO tbl_return_forms")


def test_a_return_that_is_already_in_another_form_is_rejected(app, db, caller_permissions):
    caller_permissions.set(RECEIVER)
    db.selected = [{"id": RETURN, "dispatch_guide_id": GUIDE, "form_id": "otro-form"}]
    response = _create(app, {"return_ids": [RETURN]})
    assert response["statusCode"] == 409 and "ya van en otro formulario" in body_of(response)["error"]["message"]
    assert not writes(db, "INSERT INTO tbl_return_forms")


@pytest.mark.parametrize("body", [
    {"return_ids": [RETURN], "return_kind": "regalo"},
    {"return_ids": [RETURN], "sections": [{"dispatch_guide_id": "otra-parada"}]},
    {"return_ids": [RETURN], "branch": "x" * 101},
    {"return_ids": [RETURN], "received_date": "ayer"},
])
def test_creating_a_form_validates_its_input(app, db, caller_permissions, body):
    caller_permissions.set(RECEIVER)
    assert _create(app, body)["statusCode"] == 400 and not writes(db, "INSERT INTO tbl_return_forms")


def test_a_reader_cannot_create_a_form(app, db, caller_permissions):
    caller_permissions.set(READER)
    assert _create(app, {"return_ids": [RETURN]})["statusCode"] == 403 and not writes(db, "INSERT INTO tbl_return_forms")


def test_reading_a_form_returns_it_with_its_returns_and_sections(app, db, caller_permissions):
    caller_permissions.set(READER)
    db.form = {"id": "form-1", "form_number": "DEV-2026-11-0001", "route_id": ROUTE}
    data = body_of(call(app, "GET /api/v1/devoluciones/formularios/{formId}", path={"formId": "form-1"}))["data"]
    assert data["form"]["form_number"] == "DEV-2026-11-0001" and data["trip"]["route_id"] == ROUTE


def test_cannot_add_a_return_in_review_to_a_new_form(app, db, caller_permissions):
    caller_permissions.set(RECEIVER)
    db.selected[0]['status'] = 'in_review'
    response = _create(app, {'return_ids': [RETURN]})
    assert response['statusCode'] == 409
    assert not writes(db, 'INSERT INTO tbl_return_forms')


def test_reading_an_unknown_form_is_a_404(app, caller_permissions):
    caller_permissions.set(READER)
    assert call(app, "GET /api/v1/devoluciones/formularios/{formId}", path={"formId": "x"})["statusCode"] == 404


def test_updating_a_form_keeps_its_number_and_its_returns(app, db, caller_permissions):
    caller_permissions.set(RECEIVER)
    db.form = {"id": "form-1", "form_number": "DEV-2026-10-0001", "route_id": ROUTE}
    body = {"comments": "ok", "sections": [{"dispatch_guide_id": GUIDE, "customer_name": "Cliente"}]}
    response = call(app, "PUT /api/v1/devoluciones/formularios/{formId}", path={"formId": "form-1"}, body=body)
    assert response["statusCode"] == 200
    assert not writes(db, "INSERT INTO tbl_return_forms") and not writes(db, "INSERT INTO tbl_return_form_items")
    assert writes(db, "UPDATE tbl_return_forms")[0][-2:] == ["form-1", ORG]


def test_updating_a_form_rejects_a_section_of_a_stop_it_does_not_cover(app, db, caller_permissions):
    caller_permissions.set(RECEIVER)
    db.form = {"id": "form-1", "form_number": "DEV-X", "route_id": ROUTE}
    body = {"sections": [{"dispatch_guide_id": "otra-parada"}]}
    assert call(app, "PUT /api/v1/devoluciones/formularios/{formId}", path={"formId": "form-1"}, body=body)["statusCode"] == 400


def test_updating_an_unknown_form_is_a_404(app, caller_permissions):
    caller_permissions.set(RECEIVER)
    assert call(app, "PUT /api/v1/devoluciones/formularios/{formId}", path={"formId": "x"}, body={})["statusCode"] == 404


def test_country_query_param_filters_summary_and_trips(app, db, caller_permissions):
    caller_permissions.set(READER)
    valid_country = "11111111-1111-1111-1111-111111111111"
    # Resumen con filtro de país
    res_summary = call(app, "GET /api/v1/devoluciones/resumen", query={"pais": valid_country})
    assert res_summary["statusCode"] == 200
    sql_summary, params_summary = next(c for c in db.calls if "FROM vw_return_trips" in c[0] and "WHERE" in c[0])
    assert "country_id = %s::uuid" in sql_summary and valid_country in params_summary

    # Viajes con filtro de país
    res_trips = call(app, "GET /api/v1/devoluciones/viajes", query={"pais": valid_country})
    assert res_trips["statusCode"] == 200
    sql_trips, params_trips = next(c for c in reversed(db.calls) if "FROM vw_return_trips" in c[0] and "ORDER BY" in c[0])
    assert "country_id = %s::uuid" in sql_trips and valid_country in params_trips

    # País inválido da 400
    assert call(app, "GET /api/v1/devoluciones/resumen", query={"pais": "no-uuid"})["statusCode"] == 400


def test_cursor_and_selected_country_keep_role_scope_together(app, db, caller_permissions):
    country = "11111111-1111-1111-1111-111111111111"
    route_id = "22222222-2222-2222-2222-222222222222"
    caller_permissions.set(make_permissions({"devoluciones": ["view"]}, countries=[country]))
    cursor = base64.urlsafe_b64encode(json.dumps(["2026-11-12", "R-2", route_id]).encode()).decode().rstrip("=")
    response = call(app, "GET /api/v1/devoluciones/viajes", query={"pais": country, "cursor": cursor, "limit": "100"})
    assert response["statusCode"] == 200
    statement, params = next(c for c in reversed(db.calls) if "FROM vw_return_trips" in c[0] and "ORDER BY" in c[0])
    assert "country_id = %s::uuid" in statement
    assert "country_id = ANY(%s::uuid[])" in statement
    assert "%s::boolean, %s::date, %s::boolean, %s::text, %s::uuid" in statement
    assert params == [ORG, False, date(2026, 11, 12), False, "R-2", route_id, country, [country], 101]


def test_rejecting_a_return_requires_reason_and_is_audited(app, db, caller_permissions, audit_calls):
    caller_permissions.set(RECEIVER)
    response = call(app, "POST /api/v1/devoluciones/{returnId}/rechazar", path={"returnId": RETURN},
                    body={"reason": "Mercadería extraviada antes de cargar"})
    assert response["statusCode"] == 200
    assert body_of(response)["data"]["return"]["status"] == "rejected"
    assert next(c for c in db.calls if "UPDATE tbl_returns" in c[0] and "status = 'rejected'" in c[0])
    assert any(c[0] == "record" and c[2]["metadata"]["action"] == "rechazar" for c in audit_calls)


def test_rejecting_requires_reason(app, caller_permissions):
    caller_permissions.set(RECEIVER)
    assert call(app, "POST /api/v1/devoluciones/{returnId}/rechazar", path={"returnId": RETURN},
                body={})["statusCode"] == 400
    assert call(app, "POST /api/v1/devoluciones/{returnId}/rechazar", path={"returnId": RETURN},
                body={"reason": "   "})["statusCode"] == 400
    assert call(app, "POST /api/v1/devoluciones/{returnId}/rechazar", path={"returnId": RETURN},
                body={"reason": "x" * 501})["statusCode"] == 400


def test_cannot_reject_a_received_return(app, db, caller_permissions):
    caller_permissions.set(RECEIVER)
    db.return_row = {"id": RETURN, "quantity": 1, "status": "received", "route_id": ROUTE}
    assert call(app, "POST /api/v1/devoluciones/{returnId}/rechazar", path={"returnId": RETURN},
                body={"reason": "ya se recibió"})["statusCode"] == 409


def test_rejecting_already_rejected_is_idempotent(app, db, caller_permissions):
    caller_permissions.set(RECEIVER)
    db.return_row = {"id": RETURN, "quantity": 1, "status": "rejected", "route_id": ROUTE}
    res = call(app, "POST /api/v1/devoluciones/{returnId}/rechazar", path={"returnId": RETURN},
               body={"reason": "no existe"})
    assert res["statusCode"] == 200
    assert body_of(res)["data"]["return"] is None


def test_a_reader_cannot_reject_a_return(app, caller_permissions):
    caller_permissions.set(READER)
    assert call(app, "POST /api/v1/devoluciones/{returnId}/rechazar", path={"returnId": RETURN},
                body={"reason": "motivo"})["statusCode"] == 403


