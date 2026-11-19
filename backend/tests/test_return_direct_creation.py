"""La creación directa conserva la transacción sin depender del transporte HTTP."""
from conftest import load_stack_module
from test_return_requests import CLIENT, app, db, item, post


def test_creation_does_not_write_an_outbox(app, db, caller_permissions):
    caller_permissions.set(CLIENT)
    response = post(app, {'items': [item()]})
    assert response['statusCode'] == 201
    assert not any('tbl_return_request_outbox' in statement for statement, _ in db.calls)


def test_new_requests_are_marked_as_direct_contract_in_server_sql():
    sql = load_stack_module('admin', 'admin_return_requests_sql')
    assert 'collection_contract_version' in sql.INSERT_REQUEST_SQL
    assert 'collection_contract_version' in sql.INSERT_IDEMPOTENT_SQL


def test_http_transport_routes_are_not_registered(app):
    assert not any('reintentar-envio' in route or '/eventos' in route for route in app.ROUTES)
