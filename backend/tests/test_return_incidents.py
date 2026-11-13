"""Novedades: texto, alcance, bloqueo de fila e idempotencia sin base externa."""
from contextlib import contextmanager
from copy import deepcopy

import pytest

from conftest import body_of, http_event, load_stack_module
from test_returns import FakeDb, USER, ORG, RETURN, ROUTE, READER, RECEIVER
from tms_common import pg

KEY = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
PATH = 'POST /api/v1/devoluciones/{returnId}/novedades'


class IncidentsDb(FakeDb):
    def __init__(self):
        super().__init__()
        self.incidents = []
        self.tx_state = None

    def query(self, statement, params=()):
        if 'tbl_return_incidents' not in statement and "SET status = 'in_review'" not in statement:
            return super().query(statement, params)
        self.calls.append((statement,list(params)))
        if statement.lstrip().startswith('INSERT INTO tbl_return_incidents'):
            row = dict(zip(('id','organization_id','return_id','request_key','explanation','reported_by',
                            'previous_status','previous_received_quantity','previous_received_condition'),params))
            row['reported_at'] = '2026-11-12T18:00:00Z'
            self.incidents.append(row)
            return [dict(row)]
        if "SET status = 'in_review'" in statement:
            self.return_row['status'] = 'in_review'
            return [{'id':RETURN,'status':'in_review'}]
        if 'request_key = %s' in statement:
            return [dict(row) for row in self.incidents if row['request_key'] == params[-1]]
        return deepcopy(self.incidents)

    @contextmanager
    def transaction(self):
        before = deepcopy((self.return_row,self.incidents))
        try:
            yield self.query
            self.tx_state = 'commit'
        except BaseException:
            self.return_row,self.incidents = before
            self.tx_state = 'rollback'
            raise


@pytest.fixture
def incident_api(monkeypatch):
    db = IncidentsDb()
    monkeypatch.setattr(pg,'query',db.query)
    monkeypatch.setattr(pg,'transaction',db.transaction)
    return load_stack_module('admin'),db


def post(api, explanation='Faltan dos cajas y una llegó averiada.',key=KEY):
    return api.handler(http_event(PATH,path={'returnId':RETURN},body={'explanation':explanation,'idempotency_key':key},user=USER),None)


def test_recording_plain_text_moves_return_to_review_and_preserves_receipt(incident_api,caller_permissions,audit_calls):
    app,db = incident_api
    caller_permissions.set(RECEIVER)
    db.return_row.update(status='received',received_quantity=2,received_condition='Incompleto')
    response = post(app,'  Faltó una caja.  ')
    assert response['statusCode'] == 201
    assert db.return_row['status'] == 'in_review' and db.return_row['received_quantity'] == 2
    assert db.incidents[0]['explanation'] == 'Faltó una caja.'
    assert db.incidents[0]['reported_by'] == 'app-user'
    assert db.incidents[0]['previous_status'] == 'received'
    assert any('FOR UPDATE OF rt' in statement for statement,_ in db.calls)
    assert db.tx_state == 'commit'
    assert any(c[0]=='record' and c[2]['metadata']['action']=='registrar-novedad' for c in audit_calls)


@pytest.mark.parametrize('text',['','   ','x'*1001,None,42,{}])
def test_incident_requires_nonblank_text_only(incident_api,caller_permissions,text):
    app,db = incident_api
    caller_permissions.set(RECEIVER)
    assert post(app,text)['statusCode'] == 400
    assert not db.incidents


def test_replaying_same_attempt_does_not_duplicate_or_rewrite_history(incident_api,caller_permissions):
    app,db = incident_api
    caller_permissions.set(RECEIVER)
    assert post(app)['statusCode'] == 201
    previous = deepcopy(db.incidents)
    assert post(app)['statusCode'] == 200
    assert db.incidents == previous
    assert post(app,'Otro texto')['statusCode'] == 409
    assert db.incidents == previous


def test_another_attempt_while_in_review_is_conflict(incident_api,caller_permissions):
    app,db = incident_api
    caller_permissions.set(RECEIVER)
    assert post(app)['statusCode'] == 201
    assert post(app,key='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')['statusCode'] == 409
    assert len(db.incidents) == 1


def test_reader_cannot_record_and_missing_return_is_not_found(incident_api,caller_permissions):
    app,db = incident_api
    caller_permissions.set(READER)
    assert post(app)['statusCode'] == 403
    caller_permissions.set(RECEIVER);db.return_row=None
    assert post(app)['statusCode'] == 404


def test_history_requires_receipt_view_permission(incident_api,caller_permissions):
    app,_ = incident_api
    caller_permissions.set(READER)
    response=app.handler(http_event('GET /api/v1/devoluciones/{returnId}/novedades',path={'returnId':RETURN},user=USER),None)
    assert response['statusCode'] == 200
    assert body_of(response)['data']['items'] == []
