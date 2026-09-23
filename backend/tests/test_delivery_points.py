from contextlib import contextmanager

import pytest

from conftest import body_of, http_event, load_stack_module
from tms_common import pg

USER = {"id": "auth-1", "email": "admin@ologistics.com"}
POINT = {"id": "dp-1", "customer_id": "cust-1", "address_id": "addr-1", "external_code": "T010", "name": "Tienda"}
VALID = {"customer_id": "cust-1", "external_code": "T010", "name": "Tienda nueva",
         "address": {"line1": "Calle 1", "city": "Cartago", "latitude": 9.86, "longitude": -83.92}}


class FakeDb:
    def __init__(self, scope=None, point_exists=False):
        self.calls, self.committed = [], False
        self.scope, self.point_exists = scope or {}, point_exists

    def query(self, sql, params=()):
        self.calls.append((sql, list(params)))
        if "FROM app_users" in sql:
            return [{"id": "app-1", "organization_id": "org"}]
        if "FROM user_scopes" in sql:
            return [{"id": "s", "role_id": None, "country_id": None, "warehouse_id": None, "customer_id": None,
                     **self.scope}]
        if "FROM customers c LEFT JOIN warehouses" in sql:
            return [{"customer_id": "cust-1", "warehouse_id": "w-1", "country_id": "cr"}]
        if "SELECT country_id FROM customers" in sql:
            return [{"country_id": "cr"}]
        if "FROM final_customers WHERE customer_id" in sql:
            return []
        if "RETURNING id" in sql:
            return [{"id": "new-id"}]
        if "SELECT 1 FROM delivery_points" in sql:
            return [{"?": 1}] if self.point_exists else []
        if "WHERE dp.id" in sql:
            return [POINT]
        return []

    @contextmanager
    def transaction(self):
        yield self.query
        self.committed = True


@pytest.fixture
def setup(monkeypatch):
    def build(**kwargs):
        db = FakeDb(**kwargs)
        monkeypatch.setattr(pg, "query", db.query)
        monkeypatch.setattr(pg, "transaction", db.transaction)
        return load_stack_module("context"), db
    return build


def _sql(db, fragment):
    return [params for sql, params in db.calls if fragment in sql]


def test_create_writes_final_customer_address_and_point_in_one_transaction(setup):
    app, db = setup()
    response = app.handler(http_event("POST /api/v1/delivery-points", body=VALID, user=USER), None)
    assert response["statusCode"] == 200 and db.committed
    assert _sql(db, "INSERT INTO final_customers")[0] == ["cust-1", "T010", "Tienda nueva"]
    address = _sql(db, "INSERT INTO addresses")[0]
    assert address[:3] == ["cr", "Calle 1", None] and address[5:8] == [9.86, -83.92, "OK"]
    assert _sql(db, "INSERT INTO delivery_points")


@pytest.mark.parametrize("override, status", [
    ({"name": ""}, 400),
    ({"address": {"latitude": 9.8}}, 400),              # latitud sin longitud
    ({"address": {"latitude": "x", "longitude": 1}}, 400),
    ({"address": {"latitude": 200, "longitude": 1}}, 400),
])
def test_create_validates(setup, override, status):
    app, db = setup()
    response = app.handler(http_event("POST /api/v1/delivery-points", body={**VALID, **override}, user=USER), None)
    assert response["statusCode"] == status and not _sql(db, "INSERT INTO")


def test_duplicate_code_for_same_customer_is_409(setup):
    app, _ = setup(point_exists=True)
    response = app.handler(http_event("POST /api/v1/delivery-points", body=VALID, user=USER), None)
    assert response["statusCode"] == 409


def test_user_without_scope_on_customer_is_403(setup):
    app, db = setup(scope={"customer_id": "otro-cliente"})
    response = app.handler(http_event("POST /api/v1/delivery-points", body=VALID, user=USER), None)
    assert response["statusCode"] == 403 and not _sql(db, "INSERT INTO")


def test_update_point_and_address_without_coordinates_is_pending(setup):
    app, db = setup()
    body = {"name": "Renombrada", "active": False, "address": {"line1": "Otra", "city": "Heredia"}}
    response = app.handler(http_event("PATCH /api/v1/delivery-points/{id}", path={"id": "dp-1"}, body=body, user=USER), None)
    assert response["statusCode"] == 200
    assert _sql(db, "UPDATE delivery_points SET")[0] == ["Renombrada", False, "dp-1"]
    assert _sql(db, "UPDATE addresses")[0][6] == "PENDING"


def test_delete_removes_point_and_its_address(setup):
    app, db = setup()
    response = app.handler(http_event("DELETE /api/v1/delivery-points/{id}", path={"id": "dp-1"}, user=USER), None)
    assert response["statusCode"] == 200 and db.committed
    assert _sql(db, "DELETE FROM delivery_points") == [["dp-1"]]
    assert _sql(db, "DELETE FROM addresses") == [["addr-1"]]
