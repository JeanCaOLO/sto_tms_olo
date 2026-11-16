"""Novedades: texto, alcance, bloqueo de fila e idempotencia sin base externa."""
from contextlib import contextmanager
from copy import deepcopy
import uuid

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


# ── Resolución de novedades ──────────────────────────────────────────────────────────────────

RESOLVE = 'POST /api/v1/devoluciones/{returnId}/novedades/resolver'
OTHER_KEY = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'


class ResolutionDb(IncidentsDb):
    def __init__(self):
        super().__init__()
        self.resolutions = []

    def query(self, statement, params=()):
        text = statement.lstrip()
        if text.startswith('SELECT * FROM tbl_return_incident_resolutions'):
            self.calls.append((statement,list(params)))
            return [dict(row) for row in self.resolutions if row['request_key'] == params[-1]]
        if text.startswith('SELECT id,previous_status,previous_received_quantity'):
            self.calls.append((statement,list(params)))
            return [dict(self.incidents[-1])] if self.incidents else []
        if text.startswith('INSERT INTO tbl_return_incident_resolutions'):
            self.calls.append((statement,list(params)))
            row = dict(zip(('id','organization_id','return_id','incident_id','request_key','outcome','note',
                            'resolved_by','resulting_status','resulting_received_quantity',
                            'resulting_received_condition'),params))
            self.resolutions.append(row)
            return [dict(row)]
        if text.startswith('UPDATE tbl_returns\nSET status = %s, received_quantity'):
            self.calls.append((statement,list(params)))
            if self.return_row['status'] != 'in_review':
                return []
            status,quantity,condition,stamp = params[0],params[1],params[2],params[3]
            self.return_row.update(status=status,received_quantity=quantity,received_condition=condition,
                                   stamped=stamp)
            return [{'id':RETURN,'status':status,'received_quantity':quantity,'received_condition':condition}]
        return super().query(statement,params)

    @contextmanager
    def transaction(self):
        before = deepcopy((self.return_row,self.incidents,self.resolutions))
        try:
            yield self.query
            self.tx_state = 'commit'
        except BaseException:
            self.return_row,self.incidents,self.resolutions = before
            self.tx_state = 'rollback'
            raise


@pytest.fixture
def resolution_api(monkeypatch):
    db = ResolutionDb()
    monkeypatch.setattr(pg,'query',db.query)
    monkeypatch.setattr(pg,'transaction',db.transaction)
    return load_stack_module('admin'),db


def open_review(app,db,caller_permissions,**receipt):
    caller_permissions.set(RECEIVER)
    db.return_row.update(receipt)
    assert post(app)['statusCode'] == 201
    assert db.return_row['status'] == 'in_review'


def resolve(api,outcome='restored',note='Revisado con bodega.',key=KEY,**extra):
    incident_id = str(uuid.uuid5(uuid.NAMESPACE_URL,f'return-incident:{ORG}:{RETURN}:app-user:{key}'))
    body = {'incident_id':incident_id,'outcome':outcome,'note':note,'idempotency_key':key,**extra}
    return api.handler(http_event(RESOLVE,path={'returnId':RETURN},body=body,user=USER),None)


def test_restoring_returns_the_previous_state_and_amounts(resolution_api,caller_permissions,audit_calls):
    app,db = resolution_api
    open_review(app,db,caller_permissions,status='received',received_quantity=2,received_condition='Incompleto')
    response = resolve(app,'restored')
    assert response['statusCode'] == 201
    assert db.return_row['status'] == 'received'
    assert db.return_row['received_quantity'] == 2 and db.return_row['received_condition'] == 'Incompleto'
    assert db.resolutions[0]['incident_id'] == db.incidents[0]['id']
    assert db.resolutions[0]['resolved_by'] == 'app-user'
    assert db.tx_state == 'commit'
    assert any(c[0]=='record' and c[2]['metadata']['action']=='resolver-novedad' for c in audit_calls)


def test_restoring_an_unreceived_return_goes_back_to_pending_without_receipt(resolution_api,caller_permissions):
    app,db = resolution_api
    open_review(app,db,caller_permissions)
    assert resolve(app,'restored')['statusCode'] == 201
    assert db.return_row['status'] == 'pending'
    assert db.return_row['received_quantity'] is None
    assert db.return_row.get('stamped') is False


def test_accepting_requires_explicit_amounts_when_nothing_was_received(resolution_api,caller_permissions):
    app,db = resolution_api
    open_review(app,db,caller_permissions)
    response = resolve(app,'accepted')
    assert response['statusCode'] == 400
    assert db.return_row['status'] == 'in_review' and not db.resolutions
    response = resolve(app,'accepted',received_quantity=2,condition='Dañado')
    assert response['statusCode'] == 201
    assert db.return_row['status'] == 'received'
    assert db.return_row['received_quantity'] == 2 and db.return_row['received_condition'] == 'Dañado'
    assert db.return_row['stamped'] is True


def test_accepting_after_a_receipt_keeps_the_recorded_receipt(resolution_api,caller_permissions):
    app,db = resolution_api
    open_review(app,db,caller_permissions,status='received',received_quantity=2,received_condition='Incompleto')
    assert resolve(app,'accepted')['statusCode'] == 201
    assert db.return_row['status'] == 'received' and db.return_row['received_quantity'] == 2
    assert db.return_row['stamped'] is False


@pytest.mark.parametrize('extra',[{'received_quantity':-1},{'received_quantity':True},{'received_quantity':'3'},{'condition':'Roto'}])
def test_accepting_rejects_invalid_amounts(resolution_api,caller_permissions,extra):
    app,db = resolution_api
    open_review(app,db,caller_permissions)
    payload = {'received_quantity':1,'condition':'Bueno',**extra}
    assert resolve(app,'accepted',**payload)['statusCode'] == 400
    assert db.return_row['status'] == 'in_review'


@pytest.mark.parametrize('body',[{'outcome':'otro','note':'x'},{'outcome':'restored','note':''},
                                  {'outcome':'restored','note':'x'*1001},{'outcome':'restored'},
                                  {'outcome':'restored','note':'ok','idempotency_key':'no-uuid'}])
def test_resolution_validates_outcome_note_and_key(resolution_api,caller_permissions,body):
    app,db = resolution_api
    open_review(app,db,caller_permissions)
    payload = {'idempotency_key':KEY,**body}
    response = app.handler(http_event(RESOLVE,path={'returnId':RETURN},body=payload,user=USER),None)
    assert response['statusCode'] == 400
    assert db.return_row['status'] == 'in_review' and not db.resolutions


def test_replay_is_idempotent_and_changed_data_conflicts(resolution_api,caller_permissions):
    app,db = resolution_api
    open_review(app,db,caller_permissions)
    assert resolve(app,'restored')['statusCode'] == 201
    snapshot = deepcopy(db.resolutions)
    assert resolve(app,'restored')['statusCode'] == 200
    assert db.resolutions == snapshot
    assert resolve(app,'restored','Otro motivo')['statusCode'] == 409
    assert resolve(app,'accepted',received_quantity=1,condition='Bueno')['statusCode'] == 409
    assert db.resolutions == snapshot


def test_cannot_resolve_a_return_that_is_not_in_review(resolution_api,caller_permissions):
    app,db = resolution_api
    caller_permissions.set(RECEIVER)
    assert resolve(app,'restored')['statusCode'] == 409
    assert not db.resolutions


def test_a_second_attempt_after_resolving_is_conflict(resolution_api,caller_permissions):
    app,db = resolution_api
    open_review(app,db,caller_permissions)
    assert resolve(app,'restored')['statusCode'] == 201
    assert resolve(app,'restored',key=OTHER_KEY)['statusCode'] == 409
    assert len(db.resolutions) == 1


def test_only_roles_that_can_receive_may_resolve(resolution_api,caller_permissions):
    app,db = resolution_api
    open_review(app,db,caller_permissions)
    caller_permissions.set(READER)
    assert resolve(app,'restored')['statusCode'] == 403
    assert db.return_row['status'] == 'in_review' and not db.resolutions


def test_missing_return_is_not_found_and_lock_is_taken(resolution_api,caller_permissions):
    app,db = resolution_api
    open_review(app,db,caller_permissions)
    resolve(app,'restored')
    assert any('FOR UPDATE OF rt' in statement for statement,_ in db.calls)
    db.return_row = None
    assert resolve(app,'restored',key=OTHER_KEY)['statusCode'] == 404


def test_a_new_incident_can_be_recorded_and_resolved_again(resolution_api,caller_permissions):
    app,db = resolution_api
    open_review(app,db,caller_permissions)
    assert resolve(app,'restored')['statusCode'] == 201
    assert post(app,'Otra vez.',OTHER_KEY)['statusCode'] == 201
    assert db.return_row['status'] == 'in_review'
    assert resolve(app,'restored',key=OTHER_KEY)['statusCode'] == 201
    assert len(db.resolutions) == 2 and db.resolutions[1]['incident_id'] == db.incidents[1]['id']


@pytest.mark.parametrize('change',[{'received_quantity':1},{'condition':'Incompleto'}])
def test_resolution_replay_rejects_changed_receipt(resolution_api,caller_permissions,change):
    app,db = resolution_api
    open_review(app,db,caller_permissions)
    body={'received_quantity':2,'condition':'Bueno'}
    assert resolve(app,'accepted',**body)['statusCode']==201
    assert resolve(app,'accepted',**body)['statusCode']==200
    assert resolve(app,'accepted',**{**body,**change})['statusCode']==409
    assert db.return_row['received_quantity']==2 and db.return_row['received_condition']=='Bueno'
    assert len(db.resolutions)==1


def test_stale_resolution_cannot_close_a_new_incident(resolution_api,caller_permissions):
    app,db = resolution_api
    open_review(app,db,caller_permissions)
    old_incident=db.incidents[-1]['id']
    assert resolve(app,'restored')['statusCode']==201
    assert post(app,'Otra novedad no revisada.',OTHER_KEY)['statusCode']==201
    response=resolve(app,'accepted',key='dddddddd-dddd-4ddd-8ddd-dddddddddddd',incident_id=old_incident,
                     received_quantity=1,condition='Bueno')
    assert response['statusCode']==409
    assert db.return_row['status']=='in_review' and len(db.resolutions)==1
    # Repetir la primera resolución no cierra el nuevo episodio de revisión.
    assert resolve(app,'restored')['statusCode']==200
    assert db.return_row['status']=='in_review'


@pytest.mark.parametrize('incident_id',[None,'no-uuid'])
def test_resolution_requires_explicit_valid_incident(resolution_api,caller_permissions,incident_id):
    app,db = resolution_api
    open_review(app,db,caller_permissions)
    assert resolve(app,incident_id=incident_id)['statusCode']==400
    assert not db.resolutions and db.return_row['status']=='in_review'


def test_invalid_replay_receipt_is_not_silently_acknowledged(resolution_api,caller_permissions):
    app,db = resolution_api
    open_review(app,db,caller_permissions)
    assert resolve(app,'accepted',received_quantity=2,condition='Bueno')['statusCode']==201
    assert resolve(app,'accepted',received_quantity=2,condition='Inválido')['statusCode']==400
    assert resolve(app,'accepted',received_quantity=True,condition='Bueno')['statusCode']==400
