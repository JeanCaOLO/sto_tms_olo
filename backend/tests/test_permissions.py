"""Matriz de permisos por rol (sql/15): permisos efectivos, enforcement en la API
genérica y endpoints de administración de la matriz."""

from contextlib import contextmanager

import pytest

from conftest import body_of, http_event, load_stack_module, make_permissions
from tms_common import permissions, pg
from tms_common.errors import HttpError

USER = {"id": "auth-1", "email": "ops@ologistics.com"}


# --- permisos efectivos -------------------------------------------------------

def _fake_caller(monkeypatch, caller, grants=(), countries=(), modules=("pedidos", "tracking")):
    def fake_query(sql, params=()):
        if sql == permissions.CALLER_SQL:
            return [caller] if caller else []
        if sql == permissions.ROLE_PERMISSIONS_SQL:
            return [{"module_key": m, "action": a} for m, a in grants]
        if sql == permissions.ROLE_COUNTRIES_SQL:
            return [{"country_id": c} for c in countries]
        if sql == permissions.MODULES_SQL:
            return [{"key": key} for key in modules]
        raise AssertionError(sql)
    monkeypatch.setattr(pg, "query", fake_query)


def _caller(role_name="Operaciones", all_countries=True, is_active=True):
    return {"id": "app-1", "is_active": is_active, "role_id": "role-1", "role_name": role_name,
            "all_countries": all_countries}


def test_admin_role_gets_every_module_and_action(monkeypatch):
    _fake_caller(monkeypatch, _caller("SuperAdministrador"))
    perms = permissions.for_user("auth-1")
    assert perms.is_admin and perms.country_filter is None
    assert perms.to_json()["modules"] == {"pedidos": list(permissions.ACTIONS), "tracking": list(permissions.ACTIONS)}


def test_role_gets_only_its_rows_and_countries(monkeypatch):
    _fake_caller(monkeypatch, _caller(all_countries=False), grants=[("pedidos", "view"), ("pedidos", "edit")],
                 countries=["cr"])
    perms = permissions.for_user("auth-1")
    assert perms.can("pedidos", "edit") and not perms.can("pedidos", "delete") and not perms.can("tracking", "view")
    assert perms.country_filter == ("cr",)
    assert perms.to_json() == {"role": {"id": "role-1", "name": "Operaciones"}, "is_admin": False,
                               "modules": {"pedidos": ["view", "edit"]}, "countries": {"all": False, "ids": ["cr"]}}
    with pytest.raises(HttpError) as err:
        perms.require("pedidos", "delete")
    assert err.value.status == 403


def test_unknown_or_inactive_user_is_rejected(monkeypatch):
    _fake_caller(monkeypatch, None)
    with pytest.raises(HttpError) as missing:
        permissions.for_user("auth-1")
    _fake_caller(monkeypatch, _caller(is_active=False))
    with pytest.raises(HttpError) as inactive:
        permissions.for_user("auth-1")
    assert (missing.value.status, inactive.value.status) == (401, 403)


def test_unmapped_module_is_denied_to_non_admin():
    with pytest.raises(HttpError):
        make_permissions({"pedidos": "*"}).require(None, "create")
    make_permissions(is_admin=True).require(None, "create")


# --- enforcement en /api/data -------------------------------------------------

@pytest.fixture
def data_app(fake_columns, monkeypatch):
    calls = []

    def fake_query(sql, params=()):
        calls.append((sql, list(params)))
        return [{"id": "1"}]

    monkeypatch.setattr(pg, "query", fake_query)
    return load_stack_module("data"), calls


def _write(app, method, table, body):
    return app.handler(http_event(f"{method} /api/data/{{table}}", path={"table": table}, body=body, user=USER), None)


def test_write_needs_the_module_action(data_app, caller_permissions):
    app, calls = data_app
    caller_permissions.set(make_permissions({"transportistas": ["view", "edit"]}))
    denied = _write(app, "POST", "carriers", {"values": {"name": "X"}})
    assert denied["statusCode"] == 403 and not calls
    allowed = _write(app, "PATCH", "carriers", {"values": {"name": "X"}, "filters": [["id", "eq", "1"]]})
    assert allowed["statusCode"] == 200


def test_write_to_a_country_the_role_does_not_see_is_403(data_app, caller_permissions):
    app, calls = data_app
    caller_permissions.set(make_permissions({"transportistas": "*"}, countries=("cr",)))
    assert _write(app, "POST", "carriers", {"values": {"name": "X", "country_id": "ve"}})["statusCode"] == 403
    assert _write(app, "POST", "carriers", {"values": {"name": "X", "country_id": "cr"}})["statusCode"] == 200


def test_reads_are_filtered_by_the_role_countries(data_app, caller_permissions):
    app, calls = data_app
    caller_permissions.set(make_permissions({"conductores": ["view"]}, countries=("cr",)))
    for table in ("carriers", "countries", "drivers"):
        app.handler(http_event("GET /api/data/{table}", path={"table": table}, user=USER), None)
    carriers, countries, drivers = calls
    assert '(t."country_id" IN (%s) OR t."country_id" IS NULL)' in carriers[0] and carriers[1] == ["cr"]
    assert '(t."id" IN (%s) OR FALSE)' in countries[0]
    assert "country_id" not in drivers[0] and drivers[1] == []


def test_admin_reads_are_not_filtered(data_app):
    app, calls = data_app
    app.handler(http_event("GET /api/data/{table}", path={"table": "carriers"}, user=USER), None)
    assert "WHERE" not in calls[0][0]


# --- endpoints de la matriz -----------------------------------------------------

class MatrixDb:
    def __init__(self, role_name="Operaciones"):
        self.role_name = role_name
        self.writes: list[tuple[str, list]] = []

    def query(self, sql, params=()):
        if "WHERE u.auth_user_id" in sql:
            return [{"id": "app-admin", "organization_id": "org", "is_active": True, "role_name": "Admin"}]
        if "FROM roles WHERE id" in sql:
            return [{"id": params[0], "name": self.role_name, "all_countries": False}]
        if sql == permissions.MODULES_SQL:
            return [{"key": "pedidos"}, {"key": "tracking"}]
        if "FROM countries WHERE id = ANY" in sql:
            return [{"id": "cr"}]
        if sql == permissions.ROLE_PERMISSIONS_SQL:
            return [{"module_key": "pedidos", "action": "view"}]
        if sql == permissions.ROLE_COUNTRIES_SQL:
            return [{"country_id": "cr"}]
        raise AssertionError(sql)

    @contextmanager
    def transaction(self):
        yield lambda sql, params=(): self.writes.append((sql, list(params))) or []


@pytest.fixture
def matrix(monkeypatch):
    db = MatrixDb()
    monkeypatch.setattr(pg, "query", db.query)
    monkeypatch.setattr(pg, "transaction", db.transaction)
    return load_stack_module("admin"), db


def _put(app, body):
    return app.handler(http_event("PUT /api/v1/admin/roles/{id}/permissions", path={"id": "role-1"},
                                  body=body, user=USER), None)


def test_put_replaces_the_whole_matrix_in_one_transaction(matrix):
    app, db = matrix
    response = _put(app, {"modules": {"pedidos": ["view", "edit", "view"]}, "all_countries": False,
                          "country_ids": ["cr"]})
    assert response["statusCode"] == 200
    assert body_of(response)["data"] == {"modules": {"pedidos": ["view"]}, "all_countries": False,
                                         "country_ids": ["cr"], "is_admin": False}
    statements = [(sql.split()[0], params) for sql, params in db.writes]
    assert statements == [("DELETE", ["role-1"]), ("INSERT", ["role-1", "pedidos", "view"]),
                          ("INSERT", ["role-1", "pedidos", "edit"]), ("DELETE", ["role-1"]),
                          ("INSERT", ["role-1", "cr"]), ("UPDATE", [False, "role-1"])]


@pytest.mark.parametrize("body, message", [
    ({"modules": {"inventado": ["view"]}}, "Módulo desconocido"),
    ({"modules": {"pedidos": ["borrar"]}}, "Acciones inválidas"),
    ({"modules": {}, "all_countries": False, "country_ids": []}, "al menos un país"),
    ({"modules": {}, "all_countries": False, "country_ids": ["xx"]}, "País desconocido"),
])
def test_put_rejects_invalid_matrix(matrix, body, message):
    app, db = matrix
    response = _put(app, body)
    assert response["statusCode"] == 400 and message in body_of(response)["error"]["message"]
    assert not db.writes


def test_admin_role_matrix_is_not_editable(matrix):
    app, db = matrix
    db.role_name = "SuperAdministrador"
    assert _put(app, {"modules": {}})["statusCode"] == 409
    matrix_of = app.handler(http_event("GET /api/v1/admin/roles/{id}/permissions", path={"id": "r"}, user=USER), None)
    assert body_of(matrix_of)["data"]["is_admin"] is True


def test_me_permissions_returns_the_caller_matrix(matrix, caller_permissions):
    app, _ = matrix
    caller_permissions.set(make_permissions({"tracking": ["view"]}))
    response = app.handler(http_event("GET /api/v1/me/permissions", user=USER), None)
    assert body_of(response)["data"]["modules"] == {"tracking": ["view"]}


# --- lectura: `view` en algún módulo que lea la tabla ----------------------------

def _read(app, table):
    return app.handler(http_event("GET /api/data/{table}", path={"table": table}, user=USER), None)


def test_read_needs_view_in_some_module_that_reads_the_table(data_app, caller_permissions):
    app, calls = data_app
    caller_permissions.set(make_permissions({"tracking": ["view"]}))
    assert _read(app, "drivers")["statusCode"] == 403 and not calls
    caller_permissions.set(make_permissions({"dashboard": ["view"]}))
    assert _read(app, "orders")["statusCode"] == 200  # el dashboard lee pedidos sin tener el módulo pedidos


def test_reference_catalogs_are_readable_by_any_role(data_app, caller_permissions):
    app, _ = data_app
    caller_permissions.set(make_permissions())
    assert _read(app, "countries")["statusCode"] == 200


def test_app_users_is_limited_to_the_own_row_without_a_reader_module(data_app, caller_permissions):
    app, calls = data_app
    caller_permissions.set(make_permissions({"tracking": ["view"]}))
    assert _read(app, "app_users")["statusCode"] == 200
    assert '"auth_user_id" = %s' in calls[0][0] and calls[0][1] == [USER["id"]]
    caller_permissions.set(make_permissions({"conductores": ["view"]}))
    _read(app, "app_users")
    assert "WHERE" not in calls[1][0]


def test_planning_orders_need_planificacion_view(monkeypatch, caller_permissions):
    monkeypatch.setattr(pg, "query", lambda sql, params=(): [{"organization_id": "org"}])
    app = load_stack_module("planning")
    caller_permissions.set(make_permissions({"tracking": ["view"]}))
    denied = app.handler(http_event("GET /api/v1/planificacion/pedidos", user=USER), None)
    assert denied["statusCode"] == 403
