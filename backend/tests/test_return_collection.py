"""Contrato HTTP: autorización, causalidad, duplicados y límites de asignación."""
import json
from copy import deepcopy
import pytest
from conftest import body_of, http_event
from test_return_request_review import review, CLIENT, OPERATOR, REQ, FILE, USER

BASE='/api/v1/solicitudes-devolucion/{requestId}/eventos'


@pytest.fixture
def contract(review, monkeypatch):
    original=review[2].query
    state={'outbox': {'id':FILE,'status':'leased'},'events':{},'remaining':2,'guide':True}
    def query(statement,params=()):
        if 'SELECT * FROM tbl_return_request_outbox' in statement:
            return [deepcopy(state['outbox'])]
        if 'SELECT * FROM tbl_return_collection_events' in statement:
            row=state['events'].get(params[0]);return [row] if row else []
        if statement.lstrip().startswith('INSERT INTO tbl_return_collection_events'):
            state['events'][params[0]]={'request_id':REQ,'payload':json.loads(params[4])}
            return [{'id':params[0]}]
        if "SET status='acknowledged'" in statement:
            if params[2]!=REQ:return []
            state['outbox']['status']='acknowledged';return [{'id':FILE}]
        if 'SELECT g.id FROM tbl_dispatch_guides' in statement:
            return [{'id':REQ}] if state['guide'] else []
        if 'AS remaining' in statement:
            return [{'id':REQ,'remaining':state['remaining']}]
        return original(statement,params)
    monkeypatch.setattr(review[2],'query',query)
    from tms_common import pg
    monkeypatch.setattr(pg,'query',query)
    return review,state


def payload(**extra):
    return {'schema_version':1,'event_id':REQ,'causation_id':FILE,'event_type':'planning.received',
            'occurred_at':'2026-11-13T15:00:00Z','lease_token':REQ,**extra}


def send(contract,body):
    return contract[0][0].handler(http_event('POST '+BASE,user=USER,path={'requestId':REQ},body=body),None)


def test_ack_requires_operator_edit_and_causal_identity(contract,caller_permissions):
    caller_permissions.set(CLIENT)
    assert send(contract,payload())['statusCode']==403
    caller_permissions.set(OPERATOR)
    assert send(contract,payload(causation_id=REQ))['statusCode']==409
    assert send(contract,payload(lease_token=FILE))['statusCode']==409
    assert send(contract,payload(schema_version=2))['statusCode']==400
    assert send(contract,payload(occurred_at='invalid'))['statusCode']==400


def test_ack_replay_is_idempotent_and_payload_change_conflicts(contract,caller_permissions):
    caller_permissions.set(OPERATOR)
    assert send(contract,payload())['statusCode']==201
    assert body_of(send(contract,payload()))['data']['duplicate'] is True
    assert send(contract,payload(occurred_at='2026-11-13T16:00:00Z'))['statusCode']==409


def test_assignment_requires_receipt_compatible_stop_and_available_quantity(contract,caller_permissions):
    caller_permissions.set(OPERATOR)
    body=payload(event_type='planning.assigned',assignment_id=REQ,attempt_id=REQ,
                 request_item_id=REQ,route_id=REQ,stop_id=REQ,assigned_quantity=3)
    assert send(contract,body)['statusCode']==409
    contract[1]['outbox']['status']='acknowledged'
    assert send(contract,body)['statusCode']==409
    contract[1]['events'].clear();contract[1]['guide']=False
    assert send(contract,{**body,'assigned_quantity':2})['statusCode']==422


def test_creation_rolls_back_when_outbox_cannot_persist(review,caller_permissions,monkeypatch):
    from test_return_request_review import call
    original=review[2].query
    def query(statement,params=()):
        if 'INSERT INTO tbl_return_request_outbox' in statement:return []
        return original(statement,params)
    monkeypatch.setattr(review[2],'query',query)
    caller_permissions.set(CLIENT);review[2].files=[]
    response=call(review,'POST',body={'items':[{'product_code':'CODE','product_name':'Producto',
        'quantity':2,'reason_code':'danado'}]})
    assert response['statusCode']==409
