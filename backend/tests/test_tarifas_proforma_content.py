"""Regresiones 4B: contenido y total de proformas protegidos en la API genérica."""
from contextlib import contextmanager

import pytest

from conftest import body_of, http_event, load_stack_module
from test_tarifas import CR, USER
from tms_common import pg

ITEMS = "tarifas_proforma_items"
PARENT = "tarifas_proformas"
ITEM = {"id": "pri_1", "proforma_id": "pro_1", "settlement_id": "liq_1", "amount": "10.00",
        "state": "included", "exclusion_reason": None}


class ContentDb:
    def __init__(self):
        self.calls = []
        self.tx_calls = []
        self.status = "En Revisión"
        self.phases = []
        self.state = None
        self.item_after_lock = None
        self.included_count = 1

    def query(self, statement, params=()):
        self.calls.append((statement, list(params)))
        if "FROM tbl_tarifas_proforma_items WHERE id" in statement:
            if self.item_after_lock and any("FOR UPDATE" in sql for sql, _ in self.tx_calls):
                return [self.item_after_lock]
            return [dict(ITEM)]
        if "COUNT(*)" in statement:
            return [{"included_count": self.included_count}]
        if "FROM tbl_tarifas_proformas WHERE id" in statement:
            return [{"id": "pro_1", "status": self.status, "country_id": CR, "carrier_id": CR}]
        if "FROM tbl_tarifas_proforma_phases" in statement:
            return self.phases
        if "FROM tbl_tarifas_settlements WHERE id" in statement:
            if "ANY(" in statement:
                return [{"id": row_id, "total_amount": "10.00", "country_id": CR, "carrier_id": CR}
                        for row_id in params[0]]
            return [{"id": "liq_1", "total_amount": "10.00", "country_id": CR, "carrier_id": CR}]
        if statement.lstrip().startswith("UPDATE tbl_tarifas_proformas SET total_amount"):
            return [{"id": "pro_1", "total_amount": "10.00"}]
        if statement.startswith("UPDATE tbl_tarifas_settlements SET status"):
            return [{"id": row_id} for row_id in params[1]]
        return [dict(ITEM)]

    @contextmanager
    def transaction(self):
        def run(statement, params=()):
            self.tx_calls.append((statement, list(params)))
            return self.query(statement, params)
        try:
            yield run
            self.state = "commit"
        except BaseException:
            self.state = "rollback"
            raise


@pytest.fixture
def content(monkeypatch):
    db = ContentDb()
    monkeypatch.setattr(pg, "query", db.query)
    monkeypatch.setattr(pg, "transaction", db.transaction)
    return load_stack_module("tarifas"), db


def request(app, values, *, transaction=False, kind="update", table=ITEMS):
    if transaction:
        return app.handler(http_event("POST /api/tarifas/tx", body={"ops": [
            {"op": kind, "table": table, "id": "pri_1", "values": values}]}, user=USER), None)
    route = {"update": "PATCH /api/tarifas/{table}/{id}", "insert": "POST /api/tarifas/{table}",
             "delete": "DELETE /api/tarifas/{table}/{id}"}[kind]
    return app.handler(http_event(route, path={"table": table, "id": "pri_1"}, body=values, user=USER), None)


@pytest.mark.parametrize("transaction", [False, True])
@pytest.mark.parametrize("field,value", [("amount", "999"), ("proforma_id", "other"), ("settlement_id", "other")])
def test_item_financial_identity_cannot_be_patched(content, transaction, field, value):
    app, db = content
    assert request(app, {field: value}, transaction=transaction)["statusCode"] == 403
    assert not db.tx_calls


@pytest.mark.parametrize("transaction", [False, True])
def test_item_cannot_be_deleted(content, transaction):
    app, _ = content
    assert request(app, {}, transaction=transaction, kind="delete")["statusCode"] == 405


@pytest.mark.parametrize("transaction", [False, True])
@pytest.mark.parametrize("status,phases", [("Aprobado", []), ("Pagado", []), ("Borrador", [{"state": "aprobada"}])])
def test_item_edit_checks_parent_and_phases_after_shared_lock(content, transaction, status, phases):
    app, db = content
    db.status, db.phases = status, phases
    assert request(app, {"state": "excluded", "exclusion_reason": "Motivo"}, transaction=transaction)["statusCode"] == 409
    assert db.state == "rollback"
    assert any("FOR UPDATE" in sql for sql, _ in db.tx_calls)
    assert not any(sql.startswith('UPDATE "tbl_tarifas_proforma_items"') for sql, _ in db.tx_calls)


@pytest.mark.parametrize("values", [{"state": "unknown"}, {"state": "excluded", "exclusion_reason": "  "}])
def test_item_edit_rejects_invalid_state_or_empty_reason(content, values):
    app, _ = content
    assert request(app, values)["statusCode"] == 400


def test_valid_item_edit_locks_parent_before_update_and_recalculates_inside_transaction(content):
    app, db = content
    response = request(app, {"state": "excluded", "exclusion_reason": "Motivo"})
    assert response["statusCode"] == 200, body_of(response)
    assert db.state == "commit"
    statements = [sql for sql, _ in db.tx_calls]
    lock = next(i for i, sql in enumerate(statements) if "FOR UPDATE" in sql)
    update = next(i for i, sql in enumerate(statements) if sql.startswith('UPDATE "tbl_tarifas_proforma_items"'))
    total = next(i for i, sql in enumerate(statements) if "SUM(amount)" in sql)
    assert lock < update < total


def test_insert_requires_amount_matching_settlement(content):
    app, db = content
    response = request(app, {**ITEM, "amount": "999"}, kind="insert", transaction=True)
    assert response["statusCode"] == 409
    assert db.state == "rollback"


def test_insert_into_decided_parent_is_conflict(content):
    app, db = content
    db.status = "Aprobado"
    assert request(app, ITEM, kind="insert")["statusCode"] == 409


def test_parent_total_comes_from_items_instead_of_client(content):
    app, db = content
    response = request(app, {"total_amount": "999"}, table=PARENT)
    assert response["statusCode"] == 200
    statements = db.tx_calls or db.calls
    assert any("SUM(amount)" in sql for sql, _ in statements)
    assert all("999" not in params for _, params in statements)


def test_reason_only_patch_rechecks_item_after_waiting_for_parent_lock(content):
    app, db = content
    db.item_after_lock = {**ITEM, "state": "excluded", "exclusion_reason": "Otra sesión excluyó"}
    response = request(app, {"exclusion_reason": None})
    assert response["statusCode"] == 400
    assert db.state == "rollback"
    assert not any(sql.startswith('UPDATE "tbl_tarifas_proforma_items"') for sql, _ in db.tx_calls)


def test_excluding_last_included_item_rolls_back(content):
    app, db = content
    db.included_count = 0
    response = request(app, {"state": "excluded", "exclusion_reason": "Motivo"})
    assert response["statusCode"] == 409
    assert db.state == "rollback"


@pytest.mark.parametrize("field", ["carrier_id", "carrier_name", "currency", "country_id", "number"])
@pytest.mark.parametrize("transaction", [False, True])
def test_parent_financial_identity_is_immutable(content, field, transaction):
    app, db = content
    db.status = "Aprobado"
    assert request(app, {field: CR if field.endswith('_id') else "Otra identidad"},
                   table=PARENT, transaction=transaction)["statusCode"] == 403
    assert not db.tx_calls


def test_bulk_item_validation_has_bounded_queries_for_one_parent(content):
    app, db = content
    rows = [{**ITEM, "id": f"pri_{index}", "settlement_id": f"liq_{index}"} for index in range(100)]
    response = app.handler(http_event("POST /api/tarifas/tx", body={"ops": [
        {"op": "insert_many", "table": ITEMS, "rows": rows}]}, user=USER), None)
    assert response["statusCode"] == 200
    assert len(db.tx_calls) <= 7


@pytest.mark.parametrize("included,target", [(False, "Borrador"), (True, "En Revisión")])
def test_standalone_item_edit_synchronizes_settlement_status(content, included, target):
    app, db = content
    response = request(app, {"state": "included" if included else "excluded", "exclusion_reason": None if included else "Motivo"})
    assert response["statusCode"] == 200
    assert any(sql.startswith("UPDATE tbl_tarifas_settlements SET status") and params[0] == target
               for sql, params in db.tx_calls)
