"""Reglas 4B: las marcas se validan en el servidor, también por /tx."""
import pytest

from conftest import body_of, make_permissions
from test_tarifas import CR, api, call

TABLE = "tarifas_trip_order_marks"
VALUES = {"id": "mark-test", "country_id": CR, "trip_id": CR, "order_id": CR,
          "mark": "ANULADO", "reason": "Pedido cancelado", "actor": "Actor falsificado"}


@pytest.mark.parametrize("mark,reason", [("OTRA", "Motivo"), (None, "Motivo"),
                                          ("ANULADO", None), ("ANULADO", "  "), ("ANULADO", 3)])
def test_insert_mark_rejects_invalid_mark_or_missing_reason(api, mark, reason):
    app, db = api
    response = call(app, "POST /api/tarifas/{table}", path={"table": TABLE},
                    body={**VALUES, "mark": mark, "reason": reason})
    assert response["statusCode"] == 400
    assert not db.calls and not db.tx_calls


@pytest.mark.parametrize("kind", ["insert", "insert_many", "update"])
def test_transaction_validates_each_mark_before_writing(api, kind):
    app, db = api
    invalid = {**VALUES, "mark": "OTRA"}
    op = {"op": kind, "table": TABLE, "id": "mark-test", "values": invalid}
    if kind == "insert_many":
        op["rows"] = [VALUES, invalid]
    response = call(app, "POST /api/tarifas/tx", body={"ops": [op]})
    assert response["statusCode"] == 400
    assert not db.tx_calls


@pytest.mark.parametrize("transaction", [False, True])
@pytest.mark.parametrize("kind", ["insert", "update"])
def test_mark_actor_comes_from_authenticated_role(api, caller_permissions, transaction, kind):
    app, db = api
    caller_permissions.set(make_permissions({"tarifas": "*"}))
    if transaction:
        response = call(app, "POST /api/tarifas/tx", body={"ops": [
            {"op": kind, "table": TABLE, "id": "mark-test", "values": VALUES}]})
        statements = db.tx_calls
    else:
        response = call(app, ("POST /api/tarifas/{table}" if kind == "insert" else "PATCH /api/tarifas/{table}/{id}"),
                        path={"table": TABLE, "id": "mark-test"}, body=VALUES)
        statements = db.calls
    assert response["statusCode"] == 200, body_of(response)
    params = statements[-1][1]
    assert "Operaciones" in params
    assert "Actor falsificado" not in params


def test_reason_only_patch_is_guarded_by_the_existing_mark(api):
    app, db = api
    response = call(app, "PATCH /api/tarifas/{table}/{id}", path={"table": TABLE, "id": "mark-test"}, body={"reason": None})
    assert response["statusCode"] == 200
    statement, params = db.calls[-1]
    assert '"mark"' in statement.split(" WHERE ", 1)[1]
    assert "ANULADO" in params


def test_guarded_mark_update_without_a_row_is_conflict(api):
    app, db = api
    db.rows = []
    response = call(app, "PATCH /api/tarifas/{table}/{id}", path={"table": TABLE, "id": "mark-test"}, body={"reason": None})
    assert response["statusCode"] == 409


def test_guarded_mark_in_transaction_rolls_back_with_conflict(api):
    app, db = api
    db.rows = []
    response = call(app, "POST /api/tarifas/tx", body={"ops": [
        {"op": "update", "table": TABLE, "id": "mark-test", "values": {"reason": None}}]})
    assert response["statusCode"] == 409
    assert db.tx_state == "rollback"
