"""Origen explícito y saldo consolidado dentro de la transacción de creación."""
import json
from dataclasses import replace
from datetime import date
from uuid import UUID

import pytest
from conftest import body_of, http_event
from test_return_requests import app, db, post, item, CLIENT, CUSTOMER, ORG, UUID_A, UUID_B, USER, VIEWER
from tms_common import pg

DISCOVERY_ROUTE = 'GET /api/v1/solicitudes-devolucion/asignacion'


def discover(app, kind, **params):
    return app.handler(http_event(DISCOVERY_ROUTE, user=USER, query={'buscar': kind, **params}), None)


def test_customer_lookup_limits_results_to_assigned_company_and_country(app, db, caller_permissions, monkeypatch):
    caller_permissions.set(replace(CLIENT, all_countries=False, country_ids=(UUID_A,)))
    original = pg.query

    def query(statement, params=()):
        if 'FROM tbl_final_customers candidate' not in statement:
            return original(statement, params)
        assert 'JOIN tbl_delivery_points' in statement and 'fc.id=candidate.id' in statement
        assert 'a.country_id=ANY' in statement and 'strpos(translate(lower(candidate.name)' in statement
        assert list(params) == [CUSTOMER, ORG, CUSTOMER, [UUID_A], 'Ana %', 26]
        return [{'id': UUID_B, 'name': 'Ana %', 'sort_name': 'ana %'}]

    monkeypatch.setattr(pg, 'query', query)
    response = discover(app, 'clientes', customer_id=UUID_B, q=' Ana % ')
    assert response['statusCode'] == 200
    assert body_of(response)['data'] == {'items': [{'id': UUID_B, 'name': 'Ana %'}], 'next_cursor': None}


def test_order_lookup_pages_after_exact_product_filter(app, db, caller_permissions, monkeypatch):
    caller_permissions.set(CLIENT)
    original = pg.query
    rows = [{'order_id': str(UUID(int=i)), 'order_number': f'PED-{i}', 'order_date': date(2026, 11, 1)}
            for i in range(26, 0, -1)]

    def query(statement, params=()):
        if 'FROM tbl_orders candidate' not in statement:
            return original(statement, params)
        assert 'candidate.final_customer_id=%s' in statement and 'AND o.id=candidate.id' in statement
        assert 'item.product_code=%s' in statement and 'candidate.id DESC' in statement
        assert list(params[:6]) == [ORG, CUSTOMER, UUID_A, ORG, CUSTOMER, 'SKU-OLD']
        assert params[-1] == 26
        if len(params) == 7:
            return rows
        assert 'candidate.id)<(%s,%s::uuid)' in statement
        assert list(params[6:-1]) == [date(2026, 11, 1), rows[24]['order_id']]
        return rows[25:]

    monkeypatch.setattr(pg, 'query', query)
    first = body_of(discover(app, 'pedidos', final_customer_id=UUID_A, product_code=' SKU-OLD '))['data']
    assert len(first['items']) == 25 and first['items'][0]['order_date'] == '2026-11-01'
    last = body_of(discover(app, 'pedidos', final_customer_id=UUID_A, product_code='SKU-OLD',
                            cursor=first['next_cursor']))['data']
    assert [item['order_number'] for item in last['items']] == ['PED-1']
    assert last['next_cursor'] is None


def test_order_detail_checks_final_customer_before_querying_balance(app, db, caller_permissions, monkeypatch):
    caller_permissions.set(CLIENT)
    original = pg.query

    def query(statement, params=()):
        if 'WITH authorized_points' not in statement:
            return original(statement, params)
        assert 'AND o.id=%s AND fc.id=%s' in statement
        assert 'line.remaining>0' in statement and 'FROM (SELECT 1 FROM authorized_points LIMIT 1)' in statement
        assert list(params) == [ORG, CUSTOMER, UUID_A, params[3], ORG, UUID_A]
        if params[3] != UUID_B:
            return []
        return [{'points': [{'delivery_point_id': UUID_B}, {'delivery_point_id': UUID_A}],
                 'balance': [{'id': UUID_A, 'remaining': 2}]}]

    monkeypatch.setattr(pg, 'query', query)
    assert discover(app, 'puntos', order_id=UUID_A, final_customer_id=UUID_A)['statusCode'] == 404
    result = body_of(discover(app, 'puntos', order_id=UUID_A, final_customer_id=UUID_B))['data']
    assert len(result['points']) == 2
    assert result['balance'] == [{'id': UUID_A, 'remaining': 2}]


def test_discovery_rejects_missing_permission_and_invalid_filters(app, caller_permissions):
    caller_permissions.set(VIEWER)
    assert discover(app, 'clientes')['statusCode'] == 403
    caller_permissions.set(CLIENT)
    assert discover(app, 'pedidos', final_customer_id='invalid')['statusCode'] == 400
    invalid_cursor = json.dumps(['invalid-date', UUID_B])
    assert discover(app, 'pedidos', final_customer_id=UUID_A, cursor=invalid_cursor)['statusCode'] == 400


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
