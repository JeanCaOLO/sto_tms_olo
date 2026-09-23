from contextlib import contextmanager

import pytest

from conftest import body_of, http_event, load_stack_module
from tms_common import pg
from tms_common.errors import HttpError
from tms_common.passwords import verify_password

ADMIN = {"id": "auth-admin", "email": "admin@ologistics.com"}
ORG = "org-1"
VALID_USER = {"full_name": "Ana Mora", "email": "Ana@OLOgistics.com", "password": "Clave1234",
              "role_id": "role-ops", "status": "active", "scopes": [{}]}


class FakeDb:
    """Doble de Aurora: responde por fragmento de SQL y registra cada sentencia."""

    def __init__(self):
        self.calls: list[tuple[str, list]] = []
        self.caller_role = "SuperAdministrador"
        self.email_taken = False
        self.committed = False

    def query(self, sql, params=()):
        self.calls.append((sql, list(params)))
        if "FROM app_users u LEFT JOIN roles r ON r.id = u.role_id\nWHERE u.auth_user_id" in sql:
            return [{"id": "app-admin", "organization_id": ORG, "is_active": True, "role_name": self.caller_role}]
        if "FROM auth_credentials WHERE email" in sql:
            return [{"?": 1}] if self.email_taken else []
        if "FROM roles WHERE id" in sql:
            return [{"?": 1}]
        if sql.lstrip().startswith("INSERT INTO app_users"):
            return [{"id": "app-new"}]
        if "FROM app_users WHERE id = %s AND organization_id" in sql:
            return [{"id": params[0], "auth_user_id": "auth-target"}]
        if "jsonb_agg" in sql:
            return [{"id": "app-new", "email": "ana@ologistics.com", "role_id": "role-ops", "scopes": []}]
        if "AS uses" in sql:
            return [{"uses": 0}]
        if "RETURNING" in sql:
            return [{"id": "role-new", "name": params[0]}]
        return []

    @contextmanager
    def transaction(self):
        yield self.query
        self.committed = True


@pytest.fixture
def db(monkeypatch):
    fake = FakeDb()
    monkeypatch.setattr(pg, "query", fake.query)
    monkeypatch.setattr(pg, "transaction", fake.transaction)
    return fake


@pytest.fixture
def app(db):
    return load_stack_module("admin")


def _sql(db, fragment):
    return [params for sql, params in db.calls if fragment in sql]


def test_create_user_is_atomic_and_writes_credential_user_and_global_scope(app, db):
    response = app.handler(http_event("POST /api/v1/admin/users", body=VALID_USER, user=ADMIN), None)
    assert response["statusCode"] == 200 and db.committed
    credential = _sql(db, "INSERT INTO auth_credentials")[0]
    assert credential[1] == "ana@ologistics.com" and verify_password("Clave1234", credential[2])
    assert _sql(db, "INSERT INTO app_users")[0][1:] == [ORG, "Ana Mora", "ana@ologistics.com", "role-ops", True]
    assert _sql(db, "INSERT INTO user_scopes")[0] == ["app-new", "role-ops", None, None, None]


@pytest.mark.parametrize("override, message", [
    ({"password": "corta"}, "al menos 8"),
    ({"email": "sin-arroba"}, "correo no es válido"),
    ({"scopes": []}, "al menos un alcance"),
    ({"status": "borrado"}, "Estado inválido"),
])
def test_create_user_validates_payload(app, db, override, message):
    response = app.handler(http_event("POST /api/v1/admin/users", body={**VALID_USER, **override}, user=ADMIN), None)
    assert response["statusCode"] == 400 and message in body_of(response)["error"]["message"]
    assert not _sql(db, "INSERT INTO")


def test_duplicate_email_is_409(app, db):
    db.email_taken = True
    response = app.handler(http_event("POST /api/v1/admin/users", body=VALID_USER, user=ADMIN), None)
    assert response["statusCode"] == 409


def test_non_admin_is_forbidden(app, db):
    db.caller_role = "Operador"
    for key in ("GET /api/v1/admin/users", "GET /api/v1/admin/roles"):
        assert app.handler(http_event(key, user=ADMIN), None)["statusCode"] == 403


def test_update_replaces_scopes_and_syncs_role(app, db):
    body = {"role_id": "role-x", "scopes": [{"country_id": "cr"}, {"country_id": "cr"}]}
    response = app.handler(http_event("PATCH /api/v1/admin/users/{id}", path={"id": "app-9"}, body=body, user=ADMIN), None)
    assert response["statusCode"] == 200
    assert _sql(db, "DELETE FROM user_scopes") == [["app-9"]]
    assert _sql(db, "INSERT INTO user_scopes") == [["app-9", "role-x", "cr", None, None]]


def test_admin_cannot_delete_or_deactivate_self(app, db):
    delete = app.handler(http_event("DELETE /api/v1/admin/users/{id}", path={"id": "app-admin"}, user=ADMIN), None)
    deactivate = app.handler(http_event("PATCH /api/v1/admin/users/{id}", path={"id": "app-admin"},
                                        body={"status": "inactive"}, user=ADMIN), None)
    assert delete["statusCode"] == deactivate["statusCode"] == 400


def test_delete_removes_scopes_user_and_credential(app, db):
    response = app.handler(http_event("DELETE /api/v1/admin/users/{id}", path={"id": "app-9"}, user=ADMIN), None)
    assert response["statusCode"] == 200 and db.committed
    assert _sql(db, "DELETE FROM auth_credentials") == [["auth-target"]]


def test_reset_password_hashes_new_password(app, db):
    event = http_event("POST /api/v1/admin/users/{id}/password", path={"id": "app-9"},
                       body={"password": "NuevaClave1"}, user=ADMIN)
    assert app.handler(event, None)["statusCode"] == 200
    new_hash, auth_user_id = _sql(db, "UPDATE auth_credentials")[0]
    assert auth_user_id == "auth-target" and verify_password("NuevaClave1", new_hash)


def test_role_crud_and_in_use_guard(app, db, monkeypatch):
    created = app.handler(http_event("POST /api/v1/admin/roles", body={"name": "Supervisor"}, user=ADMIN), None)
    assert body_of(created)["data"]["name"] == "Supervisor"
    original = db.query

    def in_use(sql, params=()):
        return [{"uses": 2}] if "AS uses" in sql else original(sql, params)

    monkeypatch.setattr(pg, "query", in_use)
    blocked = app.handler(http_event("DELETE /api/v1/admin/roles/{id}", path={"id": "r1"}, user=ADMIN), None)
    assert blocked["statusCode"] == 409


def test_generic_data_api_blocks_writes_to_admin_tables(fake_columns, monkeypatch):
    monkeypatch.setattr(pg, "query", lambda *_a: pytest.fail("no debe llegar a la BD"))
    data = load_stack_module("data")
    event = http_event("PATCH /api/data/{table}", path={"table": "app_users"},
                       body={"values": {"role_id": "x"}, "filters": [["id", "eq", "1"]]}, user=ADMIN)
    assert data.handler(event, None)["statusCode"] == 403


def test_transaction_rolls_back_on_error(monkeypatch):
    statements = []
    monkeypatch.setattr(pg, "_live_connection", lambda: object())
    monkeypatch.setattr(pg, "_run", lambda _c, sql, _p: statements.append(sql) or [])
    with pytest.raises(HttpError):
        with pg.transaction() as run:
            run("INSERT 1")
            raise HttpError(400, "boom")
    assert statements == ["BEGIN", "INSERT 1", "ROLLBACK"]
