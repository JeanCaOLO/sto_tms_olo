"""Bloqueo de liquidación: un viaje con devoluciones sin recibir no se liquida (backend/tarifas/src/returns_gate.py)."""

from contextlib import contextmanager

import pytest

from conftest import body_of, http_event, load_stack_module
from tms_common import pg

USER = {"id": "auth-1", "email": "liquidador@ologistics.com"}
CR = "22222222-2222-2222-2222-222222222221"
TRIP = "33333333-3333-3333-3333-333333333331"
SETTLEMENT = {"country_id": CR, "trip_id": TRIP, "status": "Borrador"}
SETTLEMENTS = {"table": "tarifas_settlements"}


class FakeDb:
    def __init__(self):
        self.calls = []
        self.tx_calls = []
        self.tx_state = None
        self.open_returns = 0
        self.locked_statuses = []
        self.open_collections = []

    def query(self, sql, params=()):
        self.calls.append((sql, list(params)))
        if "AS open_returns" in sql:
            return [{"open_returns": self.open_returns}]
        if 'AS open_collections' in sql:
            return [{'open_collections':0}]
        return [{"id": "x"}]

    @contextmanager
    def transaction(self):
        def run(sql, params=()):
            self.tx_calls.append((sql, list(params)))
            if "FOR SHARE OF rt" in sql:
                return [{"status": status} for status in self.locked_statuses]
            if 'FROM vw_return_collection_assignments a' in sql:
                return self.open_collections
            return [{"id": "x"}]
        yield run
        self.tx_state = "commit"


@pytest.fixture
def api(monkeypatch):
    monkeypatch.delenv("TMS_RETURNS_GATE", raising=False)
    db = FakeDb()
    monkeypatch.setattr(pg, "query", db.query)
    monkeypatch.setattr(pg, "transaction", db.transaction)
    return load_stack_module("tarifas"), db


def call(app, route, *, path=None, body=None):
    return app.handler(http_event(route, path=path, body=body, user=USER), None)


def gate_queries(db):
    return [c for c in db.calls if "AS open_returns" in c[0]]


def inserts(db):
    return [c for c in db.calls + db.tx_calls if c[0].startswith('INSERT INTO "tbl_tarifas_settlements"')]


def test_with_the_flag_off_nothing_changes_even_with_open_returns(api):
    app, db = api
    db.open_returns = 3
    assert call(app, "POST /api/tarifas/{table}", path=SETTLEMENTS, body=SETTLEMENT)["statusCode"] == 200
    assert not gate_queries(db) and inserts(db)


def test_a_trip_with_unreceived_returns_cannot_be_settled(api, monkeypatch):
    monkeypatch.setenv("TMS_RETURNS_GATE", "on")
    app, db = api
    db.open_returns = 2
    response = call(app, "POST /api/tarifas/{table}", path=SETTLEMENTS, body=SETTLEMENT)
    assert response["statusCode"] == 409 and "2 devolución" in body_of(response)["error"]["message"]
    assert gate_queries(db)[0][1] == [TRIP] and not inserts(db)


def test_a_trip_with_every_return_received_or_none_is_settled_as_before(api, monkeypatch):
    monkeypatch.setenv("TMS_RETURNS_GATE", "on")
    app, db = api
    assert call(app, "POST /api/tarifas/{table}", path=SETTLEMENTS, body=SETTLEMENT)["statusCode"] == 200
    assert gate_queries(db) and inserts(db)


def test_the_check_counts_pending_approved_and_review_returns_of_that_route(api):
    sql = load_stack_module("tarifas", "returns_gate").OPEN_RETURNS_SQL
    assert "g.route_id = %s" in sql and "IN ('pending', 'approved', 'in_review')" in sql


def test_a_transaction_that_inserts_a_blocked_settlement_opens_no_transaction(api, monkeypatch):
    monkeypatch.setenv("TMS_RETURNS_GATE", "on")
    app, db = api
    db.open_returns = 1
    ops = [{"op": "insert", "table": "tarifas_settlements", "values": SETTLEMENT}]
    response = call(app, "POST /api/tarifas/tx", body={"ops": ops})
    assert response["statusCode"] == 409 and db.tx_state is None and not db.tx_calls


def test_a_batch_insert_is_blocked_if_any_of_its_trips_is(api, monkeypatch):
    monkeypatch.setenv("TMS_RETURNS_GATE", "on")
    app, db = api
    db.open_returns = 1
    ops = [{"op": "insert_many", "table": "tarifas_settlements", "rows": [SETTLEMENT]}]
    assert call(app, "POST /api/tarifas/tx", body={"ops": ops})["statusCode"] == 409 and not db.tx_calls


def test_other_tables_and_status_changes_are_not_checked(api, monkeypatch):
    monkeypatch.setenv("TMS_RETURNS_GATE", "on")
    app, db = api
    db.open_returns = 5
    call(app, "POST /api/tarifas/{table}", path={"table": "tarifas_audit_log"},
         body={"country_id": CR, "action": "x", "entity": "settlement", "entity_id": "s"})
    call(app, "PATCH /api/tarifas/{table}/{id}", path={**SETTLEMENTS, "id": "stl_1"}, body={"status": "Anulado"})
    assert not gate_queries(db)


def lock_queries(db):
    return [c for c in db.tx_calls if "FOR SHARE OF rt" in c[0]]


def test_the_gate_stays_blocked_while_any_return_of_the_trip_is_still_open(api, monkeypatch):
    # El gate cuenta devoluciones abiertas del viaje: una sola sin recibir mantiene el bloqueo.
    monkeypatch.setenv("TMS_RETURNS_GATE", "on")
    app, db = api
    db.open_returns = 1
    assert call(app, "POST /api/tarifas/{table}", path=SETTLEMENTS, body=SETTLEMENT)["statusCode"] == 409
    db.open_returns = 0
    assert call(app, "POST /api/tarifas/{table}", path=SETTLEMENTS, body=SETTLEMENT)["statusCode"] == 200


def test_a_single_insert_rechecks_inside_its_transaction_with_the_returns_locked(api, monkeypatch):
    monkeypatch.setenv("TMS_RETURNS_GATE", "on")
    app, db = api
    db.locked_statuses = ["received", "completed", "rejected"]
    assert call(app, "POST /api/tarifas/{table}", path=SETTLEMENTS, body=SETTLEMENT)["statusCode"] == 200
    assert lock_queries(db)[0][1] == [TRIP]
    assert db.tx_state == "commit" and inserts(db)
    order = [c[0] for c in db.tx_calls]
    assert order.index(lock_queries(db)[0][0]) < order.index(inserts(db)[0][0])


@pytest.mark.parametrize("status", ["pending", "approved", "in_review"])
def test_a_return_that_opens_after_the_first_check_still_blocks_the_insert(api, monkeypatch, status):
    # La primera lectura (sin bloqueo) vio todo recibido; la segunda, con las filas bloqueadas, ya ve la novedad.
    monkeypatch.setenv("TMS_RETURNS_GATE", "on")
    app, db = api
    db.open_returns = 0
    db.locked_statuses = ["received", status]
    response = call(app, "POST /api/tarifas/{table}", path=SETTLEMENTS, body=SETTLEMENT)
    assert response["statusCode"] == 409 and "1 devolución" in body_of(response)["error"]["message"]
    assert db.tx_state is None and not inserts(db)


def test_a_transaction_batch_rechecks_every_trip_inside_the_transaction(api, monkeypatch):
    monkeypatch.setenv("TMS_RETURNS_GATE", "on")
    app, db = api
    db.locked_statuses = ["in_review"]
    ops = [{"op": "insert_many", "table": "tarifas_settlements", "rows": [SETTLEMENT]}]
    response = call(app, "POST /api/tarifas/tx", body={"ops": ops})
    assert response["statusCode"] == 409 and db.tx_state is None and not inserts(db)
    assert lock_queries(db)


def test_without_the_flag_or_for_other_tables_nothing_is_locked(api, monkeypatch):
    app, db = api
    assert call(app, "POST /api/tarifas/{table}", path=SETTLEMENTS, body=SETTLEMENT)["statusCode"] == 200
    monkeypatch.setenv("TMS_RETURNS_GATE", "on")
    call(app, "POST /api/tarifas/{table}", path={"table": "tarifas_audit_log"},
         body={"country_id": CR, "action": "x", "entity": "settlement", "entity_id": "s"})
    assert not lock_queries(db)


def test_goods_in_transit_block_settlement_before_physical_return_exists(api,monkeypatch):
    app,db=api;monkeypatch.setenv('TMS_RETURNS_GATE','on')
    db.open_collections=[{'id':'attempt-1'}]
    response=call(app,'POST /api/tarifas/{table}',path=SETTLEMENTS,body=SETTLEMENT)
    assert response['statusCode']==409 and not inserts(db)
    statements=[sql for sql,_ in db.tx_calls]
    assert statements[0]=='SELECT id FROM tbl_routes WHERE id=%s FOR UPDATE'
