"""T04: contratos HTTP sin AWS ni conexiones de base de datos."""
from contextlib import contextmanager
from copy import deepcopy
import pytest
from conftest import body_of, http_event, load_stack_module, make_permissions
from tms_common import pg

ORG = '11111111-1111-1111-1111-111111111111'
COMPANY = '22222222-2222-2222-2222-222222222222'
REQ = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
FILE = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
COUNTRY = '33333333-3333-3333-3333-333333333333'
USER = {'id': 'auth-1', 'email': 'test@example.invalid'}
BASE = '/api/v1/solicitudes-devolucion'
CLIENT = make_permissions({'devoluciones_solicitud': ['view', 'create']})
OPERATOR = make_permissions({'devoluciones': ['view', 'edit']}, countries=[COUNTRY])


class Db:
    def __init__(self):
        self.calls = []
        self.visible = True
        self.update_wins = True
        self.created = False
        self.company = COMPANY
        self.row = dict(id=REQ, organization_id=ORG, customer_id=COMPANY, requested_by='app-user',
            request_number='SOL-2026-11-0001', status='pendiente_asignacion', decided_by=None,
            decided_at=None, rejection_reason=None, customer_name='Empresa de prueba')
        self.items = [dict(id='item-1', line_number=1, product_code='CODE', product_name='Producto',
            quantity=2, reason_code='danado', description=None)]
        self.files = [dict(id=FILE, item_id='item-1', s3_key=f'solicitudes/{ORG}/{COMPANY}/app-user/{FILE}.mp4',
            kind='video', mime_type='video/mp4', size_bytes=123)]

    def query(self, statement, params=()):
        self.calls.append((statement, list(params)))
        if 'FROM tbl_app_users' in statement and 'tbl_return_requests' not in statement:
            return [dict(organization_id=ORG, customer_id=self.company, customer_organization_id=ORG, customer_name='Empresa de prueba')]
        if statement.lstrip().startswith('SELECT DISTINCT c.id'):
            return [dict(id=COMPANY,name='Empresa de prueba')] if self.visible else []
        if statement.lstrip().startswith('UPDATE tbl_return_requests'):
            if not self.update_wins:
                return []
            self.row.update(status=params[0], decided_by=params[1], decided_at='2026-11-12T13:00:00Z', rejection_reason=params[2])
            return [deepcopy(self.row)]
        if statement.lstrip().startswith('INSERT INTO tbl_return_requests'):
            self.created = True
            self.row['id'] = params[0] if 'INSERT INTO tbl_return_requests (id,' in statement else REQ
            if 'approval_mode' in statement:
                self.row.update(status='aprobada',approval_mode='automatic',decided_by=params[-1],decided_at='2026-11-12T15:00:00Z')
            return [deepcopy(self.row)]
        if statement.lstrip().startswith('INSERT INTO tbl_return_request_items'):
            return [dict(id='item-1')]
        if 'AS next' in statement:
            return [dict(next=1)]
        if 'FROM tbl_return_request_files' in statement:
            return deepcopy(self.files) if self.visible else []
        if 'FROM tbl_return_request_items' in statement and 'count(' not in statement:
            return deepcopy(self.items)
        if 'FROM tbl_return_requests r' in statement:
            if 'WHERE r.id' in statement or 'WHERE r.id' in statement.replace('\n',' '):
                if not self.visible or ('idempotent' in statement and not self.created):
                    return []
                return [deepcopy(self.row)]
            return [deepcopy(self.row)] if self.visible else []
        return []

    @contextmanager
    def transaction(self):
        yield self.query


@pytest.fixture
def review(monkeypatch):
    db = Db()
    monkeypatch.setattr(pg, 'query', db.query)
    monkeypatch.setattr(pg, 'transaction', db.transaction)
    app = load_stack_module('admin')
    module = load_stack_module('admin', 'admin_return_requests')
    return app, module, db


def call(review, method, suffix='', *, body=None, query=None):
    return review[0].handler(http_event(f'{method} {BASE}{suffix}', user=USER,
        path={'requestId': REQ, 'fileId': FILE}, body=body, query=query), None)


def test_client_cannot_read_foreign_request(review, caller_permissions, monkeypatch):
    caller_permissions.set(CLIENT)
    review[2].visible = False
    signer = []
    monkeypatch.setattr(review[1], '_client', lambda: signer.append(True))
    assert call(review, 'GET', '/{requestId}')['statusCode'] == 404
    assert call(review, 'GET', '/{requestId}/archivos/{fileId}/url')['statusCode'] == 404
    assert signer == []


def test_client_cannot_approve_request(review, caller_permissions):
    caller_permissions.set(CLIENT)
    assert call(review, 'POST', '/{requestId}/aprobar')['statusCode'] == 403
    assert not any(s.lstrip().startswith('UPDATE') for s, _ in review[2].calls)


def test_operator_cannot_decide_other_company(review, caller_permissions):
    caller_permissions.set(OPERATOR)
    review[2].visible = False
    assert call(review, 'POST', '/{requestId}/aprobar')['statusCode'] == 404
    assert not any(s.lstrip().startswith('UPDATE') for s, _ in review[2].calls)


def test_operator_inbox_is_paginated_and_country_and_scopes_reach_sql(review, caller_permissions):
    caller_permissions.set(OPERATOR)
    response = call(review, 'GET', query={'limit': '1', 'offset': '0', 'estado': 'pendiente_asignacion', 'empresa': COMPANY})
    assert response['statusCode'] == 200
    data = body_of(response)['data']
    assert data['items'][0]['id'] == REQ and data['limit'] == 1
    statement, params = next((s,p) for s,p in review[2].calls if 'FROM tbl_return_requests r' in s)
    assert 'tbl_user_scopes' in statement and 'ANY' in statement
    assert 'app-user' in params and [COUNTRY] in params and COMPANY in params


@pytest.mark.parametrize('query', [{'estado':'invalid'}, {'empresa':'x'}, {'limit':'0'}, {'limit':'101'}, {'offset':'-1'}, {'limit':'1.5'}])
def test_invalid_inbox_filters_are_400(review, caller_permissions, query):
    caller_permissions.set(OPERATOR)
    assert call(review, 'GET', query=query)['statusCode'] == 400


def test_client_detail_contains_items_and_metadata_without_s3_keys(review, caller_permissions):
    caller_permissions.set(CLIENT)
    response = call(review, 'GET', '/{requestId}')
    assert response['statusCode'] == 200
    data = body_of(response)['data']
    assert data['request']['id'] == REQ and data['items'][0]['product_code'] == 'CODE'
    assert data['items'][0]['files'][0]['kind'] == 'video'
    assert 's3_key' not in response['body']


def test_approval_records_once_and_retry_preserves_original_actor(review, caller_permissions, audit_calls):
    caller_permissions.set(OPERATOR)
    assert call(review, 'POST', '/{requestId}/aprobar')['statusCode'] == 200
    assert call(review, 'POST', '/{requestId}/aprobar')['statusCode'] == 200
    updates = [(s,p) for s,p in review[2].calls if s.lstrip().startswith('UPDATE tbl_return_requests')]
    assert len(updates) == 1 and 'pendiente_asignacion' in updates[0][0]
    assert any('FOR UPDATE' in s for s,p in review[2].calls)
    assert len([c for c in audit_calls if c[0]=='record']) == 1


def test_opposite_decision_or_changed_rejection_reason_is_409(review, caller_permissions):
    caller_permissions.set(OPERATOR)
    assert call(review, 'POST', '/{requestId}/rechazar', body={'reason':'Falta evidencia'})['statusCode'] == 200
    assert call(review, 'POST', '/{requestId}/rechazar', body={'reason':'Falta evidencia'})['statusCode'] == 200
    assert call(review, 'POST', '/{requestId}/rechazar', body={'reason':'Otro motivo'})['statusCode'] == 409
    assert call(review, 'POST', '/{requestId}/aprobar')['statusCode'] == 409


@pytest.mark.parametrize('reason', [None, '', ' ', 'x'*501, {'bad':'object'}])
def test_rejection_requires_text_reason(review, caller_permissions, reason):
    caller_permissions.set(OPERATOR)
    assert call(review, 'POST', '/{requestId}/rechazar', body={'reason':reason})['statusCode'] == 400


def test_conditional_update_loser_is_409(review, caller_permissions, audit_calls):
    caller_permissions.set(OPERATOR)
    review[2].update_wins = False
    assert call(review, 'POST', '/{requestId}/aprobar')['statusCode'] == 409
    assert not any(c[0]=='record' for c in audit_calls)


def test_signed_video_uses_authorized_file_id_and_ttl(review, caller_permissions, monkeypatch):
    caller_permissions.set(CLIENT)
    signed = []
    class S3:
        def generate_presigned_url(self, operation, **kwargs):
            signed.append((operation,kwargs))
            return 'https://signed.example.invalid/video'
    monkeypatch.setenv('MOBILE_EVIDENCE_BUCKET','bucket-test')
    monkeypatch.setattr(review[1], '_client', lambda:S3())
    response=call(review,'GET','/{requestId}/archivos/{fileId}/url',query={'key':'pedidos/ajeno'})
    assert response['statusCode']==200
    assert signed[0][1]['Params']['Key']==review[2].files[0]['s3_key']
    assert signed[0][1]['ExpiresIn']==300


def test_creation_key_replays_same_request_and_rejects_changed_payload(review, caller_permissions, audit_calls):
    caller_permissions.set(CLIENT)
    review[2].files=[]
    payload={'idempotency_key':FILE,'items':[{'product_code':'CODE','product_name':'Producto','quantity':2,'reason_code':'danado'}]}
    first=call(review,'POST',body=payload)
    second=call(review,'POST',body=payload)
    assert first['statusCode']==201 and second['statusCode']==200
    assert body_of(first)['data']['id']==body_of(second)['data']['id']
    assert len([s for s,p in review[2].calls if s.lstrip().startswith('INSERT INTO tbl_return_requests')])==1
    payload['items'][0]['quantity']=3
    assert call(review,'POST',body=payload)['statusCode']==409
    assert len([c for c in audit_calls if c[0]=='record'])==1


def test_same_company_cannot_attach_another_users_uploaded_file(review, caller_permissions, monkeypatch):
    caller_permissions.set(CLIENT)
    heads=[]
    monkeypatch.setattr(review[1], '_head', lambda key:heads.append(key))
    payload={'items':[{'product_code':'CODE','product_name':'Producto','quantity':2,'reason_code':'danado',
        'files':[{'key':f'solicitudes/{ORG}/{COMPANY}/other-user/{FILE}.jpg'}]}]}
    assert call(review,'POST',body=payload)['statusCode']==400
    assert heads==[]


def test_s3_validation_does_not_hold_organization_numbering_lock(review, caller_permissions, monkeypatch):
    caller_permissions.set(CLIENT)
    def head(key):
        assert not any('pg_advisory_xact_lock' in s for s,p in review[2].calls)
        return {'ContentType':'video/mp4','ContentLength':123}
    monkeypatch.setattr(review[1], '_head', head)
    response=call(review,'POST',body={'items':[{'product_code':'CODE','product_name':'Producto','quantity':2,
        'reason_code':'danado','files':[{'key':review[2].files[0]['s3_key']}]}]})
    assert response['statusCode']==201


def test_malformed_upload_mime_is_400(review, caller_permissions):
    caller_permissions.set(CLIENT)
    assert call(review,'POST','/archivos/url',body={'mime_type':{'bad':'mime'}})['statusCode']==400


def test_client_cannot_read_operator_inbox(review, caller_permissions):
    caller_permissions.set(CLIENT)
    assert call(review,'GET')['statusCode']==403


def test_readonly_operator_cannot_decide(review, caller_permissions):
    caller_permissions.set(make_permissions({'devoluciones':['view']}))
    assert call(review,'GET','/{requestId}')['statusCode']==200
    assert call(review,'POST','/{requestId}/aprobar')['statusCode']==403


@pytest.mark.parametrize('key', ['solicitudes/another-org/file.mp4', 'pedidos/foreign.mp4',
    f'solicitudes/{ORG}/{COMPANY}/../foreign.mp4'])
def test_file_record_outside_request_prefix_cannot_be_signed(review, caller_permissions, monkeypatch, key):
    caller_permissions.set(CLIENT)
    review[2].files[0]['s3_key']=key
    def unexpected():
        raise AssertionError('No se debe inicializar S3')
    monkeypatch.setattr(review[1], '_client', unexpected)
    assert call(review,'GET','/{requestId}/archivos/{fileId}/url')['statusCode']==404


def test_unknown_file_id_is_404_and_missing_bucket_is_503_without_s3(review, caller_permissions, monkeypatch):
    caller_permissions.set(CLIENT)
    monkeypatch.delenv('MOBILE_EVIDENCE_BUCKET',raising=False)
    def unexpected():
        raise AssertionError('No se debe inicializar S3')
    monkeypatch.setattr(review[1], '_client', unexpected)
    assert call(review,'GET','/{requestId}/archivos/{fileId}/url')['statusCode']==503
    review[2].files=[]
    assert call(review,'GET','/{requestId}/archivos/{fileId}/url')['statusCode']==404


@pytest.mark.parametrize('token', ['', 'not-uuid', {}, 3])
def test_invalid_idempotency_key_is_400(review, caller_permissions, token):
    caller_permissions.set(CLIENT)
    assert call(review,'POST',body={'idempotency_key':token,'items':[{'product_code':'CODE',
        'product_name':'Producto','quantity':2,'reason_code':'danado'}]})['statusCode']==400


def test_audit_failure_aborts_decision_transaction(review, caller_permissions, monkeypatch):
    from tms_common import audit
    caller_permissions.set(OPERATOR)
    rolled_back=[]
    @contextmanager
    def transaction():
        before=deepcopy(review[2].row)
        try:
            yield review[2].query
        except Exception:
            review[2].row=before
            rolled_back.append(True)
            raise
    monkeypatch.setattr(pg,'transaction',transaction)
    def failed_audit(*args,**kwargs):
        raise RuntimeError('Synthetic audit failure')
    monkeypatch.setattr(audit,'record',failed_audit)
    assert call(review,'POST','/{requestId}/aprobar')['statusCode']==500
    assert rolled_back==[True] and review[2].row['status']=='pendiente_asignacion'


def test_creation_rechecks_idempotency_after_waiting_for_lock(review, caller_permissions, monkeypatch, audit_calls):
    caller_permissions.set(CLIENT)
    review[2].files=[]
    original=review[2].query
    locked=[]
    def race(statement,params=()):
        if 'pg_advisory_xact_lock' in statement:
            locked.append(True)  # Otro proceso confirmo mientras este esperaba el lock.
        if 'idempotent:' in statement:
            review[2].created=bool(locked)
            review[2].row['id']=params[0]
        return original(statement,params)
    monkeypatch.setattr(pg,'query',race)
    monkeypatch.setattr(review[2],'query',race)
    response=call(review,'POST',body={'idempotency_key':FILE,'items':[{'product_code':'CODE',
        'product_name':'Producto','quantity':2,'reason_code':'danado'}]})
    assert response['statusCode']==200 and locked==[True]
    assert not any(s.lstrip().startswith('INSERT') for s,p in review[2].calls)
    assert not any(c[0]=='record' for c in audit_calls)


def test_client_assignment_is_readonly_and_comes_from_authenticated_user(review, caller_permissions):
    caller_permissions.set(CLIENT)
    response=call(review,'GET','/asignacion',query={'customer_id':'foreign'})
    assert response['statusCode']==200
    assert body_of(response)['data']=={'id':COMPANY,'name':'Empresa de prueba'}
    assert not any(s.lstrip().startswith(('UPDATE','INSERT','DELETE')) for s,p in review[2].calls)


def test_client_assignment_without_company_is_403(review, caller_permissions):
    caller_permissions.set(CLIENT)
    review[2].company=None
    assert call(review,'GET','/asignacion')['statusCode']==403


@pytest.mark.parametrize('actions', [['view'],['create']])
def test_client_assignment_respects_client_permissions(review, caller_permissions, actions):
    caller_permissions.set(make_permissions({'devoluciones_solicitud':actions}))
    assert call(review,'GET','/asignacion')['statusCode']==200
    caller_permissions.set(OPERATOR)
    assert call(review,'GET','/asignacion')['statusCode']==403


def test_inbox_company_options_are_scoped_and_country_is_validated(review, caller_permissions):
    caller_permissions.set(OPERATOR)
    response=call(review,'GET',query={'pais':COUNTRY})
    assert response['statusCode']==200 and 'companies' in body_of(response)['data']
    queries=[(s,p) for s,p in review[2].calls if 'SELECT DISTINCT c.id' in s]
    assert len(queries)==1 and 'tbl_user_scopes' in queries[0][0]
    assert [COUNTRY] in queries[0][1] and COUNTRY in queries[0][1]
    assert call(review,'GET',query={'pais':'invalid'})['statusCode']==400
