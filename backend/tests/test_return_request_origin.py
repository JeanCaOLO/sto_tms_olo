"""Origen explícito y saldo consolidado dentro de la transacción de creación."""
import pytest
from conftest import http_event
from test_return_requests import app, db, post, item, CLIENT, UUID_A, UUID_B, USER


def test_origin_is_required_without_inference(app, caller_permissions):
    caller_permissions.set(CLIENT)
    response = app.handler(http_event('POST /api/v1/solicitudes-devolucion', user=USER,
                                    body={'items': [item()]}), None)
    assert response['statusCode'] == 400


@pytest.mark.parametrize('mode,status', [('foreign',404),('incomplete',422),('manual',422),('balance',409)])
def test_origin_and_balance_rejections(app, db, monkeypatch, caller_permissions, mode, status):
    from tms_common import pg
    caller_permissions.set(CLIENT)
    original = db.query
    def query(statement, params=()):
        if mode == 'foreign' and 'SELECT id FROM tbl_orders' in statement:
            return []
        if mode == 'incomplete' and 'FROM tbl_orders o' in statement:
            return []
        if 'return_balance_76' in statement:
            return [{'id': UUID_A, 'product_code': 'ART-1', 'remaining': 3}]
        return original(statement, params)
    monkeypatch.setattr(db, 'query', query)
    monkeypatch.setattr(pg, 'query', query)
    entries = [item(order_item_id=UUID_B)] if mode == 'manual' else [item(),item()]
    assert post(app, {'items': entries})['statusCode'] == status
    assert not any(s.lstrip().startswith('INSERT') for s, _ in db.calls)
