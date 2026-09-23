import json

import pytest

from conftest import body_of, http_event, load_stack_module
from tms_common import pg

USER = {"id": "u1", "email": "dev@olo.com"}


@pytest.fixture
def data_app(fake_columns, monkeypatch):
    calls = []

    def fake_query(sql, params=()):
        calls.append((sql, list(params)))
        return fake_query.rows

    fake_query.rows = [{"id": "1", "name": "A"}]
    monkeypatch.setattr(pg, "query", fake_query)
    app = load_stack_module("data")
    return app, fake_query, calls


def test_list_returns_rows_in_supabase_shape(data_app):
    app, _, calls = data_app
    event = http_event("GET /api/data/{table}", path={"table": "drivers"},
                       query={"select": "id,name", "filters": json.dumps([["id", "eq", "1"]]), "count": "exact"},
                       user=USER)
    response = app.handler(event, None)
    assert response["statusCode"] == 200
    assert body_of(response) == {"data": [{"id": "1", "name": "A"}], "error": None, "count": 1}
    assert calls[0][1] == ["1"]


def test_single_requires_exactly_one_row(data_app):
    app, fake_query, _ = data_app
    fake_query.rows = []
    event = http_event("GET /api/data/{table}", path={"table": "drivers"}, query={"single": "true"}, user=USER)
    response = app.handler(event, None)
    assert response["statusCode"] == 406
    assert body_of(response)["error"]["message"] == "Se esperaba exactamente una fila"


def test_maybe_single_and_head_count(data_app):
    app, fake_query, _ = data_app
    fake_query.rows = []
    maybe = app.handler(http_event("GET /api/data/{table}", path={"table": "drivers"},
                                   query={"maybeSingle": "true"}, user=USER), None)
    assert body_of(maybe)["data"] is None
    fake_query.rows = [{"count": 7}]
    head = app.handler(http_event("GET /api/data/{table}", path={"table": "drivers"},
                                  query={"head": "true"}, user=USER), None)
    assert body_of(head) == {"data": None, "count": 7, "error": None}


def test_unknown_table_and_bad_json_are_400(data_app):
    app, _, calls = data_app
    unknown = app.handler(http_event("GET /api/data/{table}", path={"table": "auth_credentials"}, user=USER), None)
    assert unknown["statusCode"] == 400
    bad = app.handler(http_event("GET /api/data/{table}", path={"table": "drivers"},
                                 query={"filters": "{no-json"}, user=USER), None)
    assert bad["statusCode"] == 400
    assert calls == []


def test_insert_honours_returning_flag(data_app):
    app, _, _ = data_app
    event = http_event("POST /api/data/{table}", path={"table": "drivers"},
                       body={"values": {"name": "A"}, "returning": True}, user=USER)
    assert body_of(app.handler(event, None))["data"] == [{"id": "1", "name": "A"}]
    event = http_event("POST /api/data/{table}", path={"table": "drivers"}, body={"values": {"name": "A"}}, user=USER)
    assert body_of(app.handler(event, None))["data"] is None


def test_unexpected_error_does_not_leak_details(data_app, monkeypatch):
    app, _, _ = data_app

    def boom(*_args):
        raise RuntimeError("password=secret")

    monkeypatch.setattr(pg, "query", boom)
    event = http_event("PATCH /api/data/{table}", path={"table": "drivers"},
                       body={"values": {"name": "B"}, "filters": [["id", "eq", "1"]]}, user=USER)
    response = app.handler(event, None)
    assert response["statusCode"] == 500
    assert "secret" not in response["body"]
