"""Magnitudes de recolecta tomadas de líneas autorizadas, nunca del cliente."""
import json
from decimal import Decimal

import pytest

from conftest import load_stack_module
from test_return_requests import CLIENT, UUID_A, UUID_B, app, db, item, post


def source(identifier=UUID_A, **changes):
    return {'id': identifier, 'product_code': 'ART-1', 'presentation': 'CAJA',
            'quantity': 10, 'weight': Decimal('25.00'), 'volume': Decimal('0.5000'), **changes}


def planning(rows, totals):
    module = load_stack_module('admin', 'admin_return_requests')
    return module._planning_snapshot({'warehouse_id': UUID_B}, rows, totals)


def test_partial_quantity_uses_only_its_product_line_and_presentation():
    result = planning([source()], {UUID_A: 4})
    assert result['return_warehouse_id'] == UUID_B
    assert result['assignment_policy'] == 'whole_request'
    assert result['capacity_source'] == 'order_items'
    assert result['capacity_complete'] is True
    assert Decimal(result['weight_kg']) == Decimal('10.00')
    assert Decimal(result['volume_m3']) == Decimal('0.2000')
    assert result['items'][0]['presentation'] == 'CAJA'
    assert result['items'][0]['requested_quantity'] == 4
    assert result['items'][0]['source_quantity'] == 10


def test_same_product_in_different_presentations_keeps_its_own_magnitudes():
    rows = [source(), source(UUID_B, presentation='UNIDAD', quantity=20,
                             weight=Decimal('2.00'), volume=Decimal('0.0200'))]
    result = planning(rows, {UUID_A: 2, UUID_B: 3})
    assert Decimal(result['weight_kg']) == Decimal('5.30')
    assert Decimal(result['volume_m3']) == Decimal('0.1030')
    assert [entry['presentation'] for entry in result['items']] == ['CAJA', 'UNIDAD']


def test_missing_volume_is_unknown_and_never_becomes_zero_or_complete():
    result = planning([source(volume=None)], {UUID_A: 2})
    assert result['capacity_complete'] is False
    assert result['weight_kg'] == '5.00'
    assert result['volume_m3'] is None
    assert result['items'][0]['volume_m3'] is None
    assert result['missing_data'] == [{'order_item_id': UUID_A, 'fields': ['volume_m3']}]


@pytest.mark.parametrize('changes', [
    {'weight': None}, {'weight': Decimal('NaN')}, {'weight': Decimal('Infinity')},
    {'weight': -1}, {'weight': 0}, {'quantity': 0}, {'quantity': None}, {'presentation': None},
])
def test_invalid_source_cannot_claim_a_complete_capacity(changes):
    result = planning([source(**changes)], {UUID_A: 2})
    assert result['capacity_complete'] is False
    assert result['missing_data']


def test_missing_source_line_is_preserved_as_incomplete_without_inference():
    result = planning([], {UUID_A: 2})
    assert result['capacity_complete'] is False
    assert result['weight_kg'] is None and result['volume_m3'] is None
    assert result['items'][0]['order_item_id'] == UUID_A


def test_capacity_rounds_up_to_source_precision_instead_of_underestimating():
    result = planning([source(quantity=3, weight=Decimal('1.00'), volume=Decimal('0.0001'))], {UUID_A: 1})
    assert result['weight_kg'] == '0.34'
    assert result['volume_m3'] == '0.0001'


def test_creation_persists_server_snapshot_inside_the_locked_transaction(app, db, monkeypatch, caller_permissions):
    from tms_common import pg
    caller_permissions.set(CLIENT)
    original = db.query

    def query(statement, params=()):
        if 'FROM tbl_order_items' in statement and 'FOR SHARE' in statement:
            db.calls.append((statement, list(params)))
            assert params == [UUID_A]
            return [source()]
        if 'FROM tbl_orders o' in statement:
            return [{'order_id': UUID_A, 'delivery_point_id': UUID_B, 'warehouse_id': UUID_B}]
        return original(statement, params)

    monkeypatch.setattr(db, 'query', query)
    monkeypatch.setattr(pg, 'query', query)
    response = post(app, {'items': [item(), item()], 'weight_kg': 999,
                          'return_warehouse_id': UUID_A, 'assignment_policy': 'split'})
    assert response['statusCode'] == 201
    snapshot = next(params[3] for statement, params in db.calls if 'INSERT INTO tbl_return_request_origins' in statement)
    result = json.loads(snapshot)['planning']
    assert result['weight_kg'] == '10.00'
    assert result['volume_m3'] == '0.2000'
    assert result['items'][0]['requested_quantity'] == 4
    assert result['return_warehouse_id'] == UUID_B
    assert result['assignment_policy'] == 'whole_request'
    statements = [statement for statement, _ in db.calls]
    order_lock = next(i for i, statement in enumerate(statements) if 'SELECT id FROM tbl_orders' in statement)
    item_lock = next(i for i, statement in enumerate(statements) if 'FROM tbl_order_items' in statement)
    balance = next(i for i, statement in enumerate(statements) if 'return_balance_76' in statement)
    assert order_lock < item_lock < balance
