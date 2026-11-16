"""Pruebas con dos conexiones PostgreSQL reales. Nunca conectan a un host remoto.

TMS_RETURNS_TEST_DSN debe apuntar a una BD local desechable cuyo nombre empiece por
tms_returns_test_. Cada prueba crea su propio esquema; no modifica public.
"""
import ast
import json
import os
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Event
from time import monotonic
from urllib.parse import unquote, urlparse
from uuid import uuid4

import pytest

ROOT=Path(__file__).resolve().parents[2]
DSN=os.environ.get('TMS_RETURNS_TEST_DSN')
pytestmark=pytest.mark.skipif(not DSN,reason='Falta TMS_RETURNS_TEST_DSN: se requiere PostgreSQL real local aislado')


def sql(path,name):
    tree=ast.parse((ROOT/path).read_text(encoding='utf-8'))
    for node in tree.body:
        if isinstance(node,ast.Assign) and any(isinstance(target,ast.Name) and target.id==name for target in node.targets):
            return ast.literal_eval(node.value)
    raise AssertionError(name)


def run(connection,statement,params=()):
    cursor=connection.cursor();cursor.execute(statement,params)
    return [dict(zip([column[0] for column in cursor.description],row)) for row in cursor.fetchall()] if cursor.description else []


class Database:
    def __init__(self):
        parsed=urlparse(DSN)
        if parsed.scheme not in ('postgres','postgresql') or parsed.hostname not in ('localhost','127.0.0.1','::1'):
            raise ValueError('Solo se permite PostgreSQL en loopback')
        database=unquote(parsed.path.lstrip('/'))
        if not database.startswith('tms_returns_test_') or parsed.query or parsed.fragment:
            raise ValueError('La BD debe empezar por tms_returns_test_ y no admite parámetros adicionales')
        import pg8000.dbapi
        self.driver=pg8000.dbapi
        self.options=dict(host=parsed.hostname,port=parsed.port or 5432,database=database,
                          user=unquote(parsed.username or ''),password=unquote(parsed.password or ''),timeout=5)
        self.schema='returns_codex_'+uuid4().hex
        self.org=str(uuid4());self.order=str(uuid4());self.request=str(uuid4());self.item=str(uuid4())
        self.point=str(uuid4());self.actor=str(uuid4());self.route=str(uuid4());self.guide=str(uuid4())
        self.connections=[]

    def connect(self,search_path=True):
        connection=self.driver.connect(**self.options)
        self.connections.append(connection)
        if search_path:
            run(connection,f'SET search_path TO {self.schema},public');connection.commit()
        return connection

    def initialize(self):
        connection=self.connect(False)
        run(connection,f'CREATE SCHEMA {self.schema}')
        run(connection,f'SET search_path TO {self.schema},public')
        run(connection,'''
CREATE TABLE tbl_app_users(id uuid PRIMARY KEY);
CREATE TABLE tbl_orders(id uuid PRIMARY KEY,organization_id uuid,customer_id uuid);
CREATE TABLE tbl_order_items(id uuid PRIMARY KEY,order_id uuid,line_number int,product_code text,
 product_name text,presentation text,quantity int,quantity_cancelled int);
CREATE TABLE tbl_delivery_points(id uuid PRIMARY KEY);
CREATE TABLE tbl_return_requests(id uuid PRIMARY KEY,organization_id uuid,customer_id uuid,status text,created_at timestamptz DEFAULT now());
CREATE TABLE tbl_return_request_items(id uuid PRIMARY KEY,request_id uuid,line_number int,product_code text,product_name text,
 quantity int,reason_code text,description text);
CREATE TABLE tbl_routes(id uuid PRIMARY KEY,organization_id uuid);
CREATE TABLE tbl_dispatch_guides(id uuid PRIMARY KEY,route_id uuid,organization_id uuid,order_id uuid);
CREATE TABLE tbl_tracking_evidences(id uuid PRIMARY KEY);
CREATE TABLE tbl_returns(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid,dispatch_guide_id uuid,
 order_id uuid,request_item_id uuid,return_number text,return_type text,reason text,product_code text,product_name text,
 quantity int,photo_url text,notes text,status text DEFAULT 'pending',received_at timestamptz,received_by uuid,
 received_quantity int,received_condition text,updated_at timestamptz DEFAULT now(),UNIQUE(organization_id,return_number));
CREATE TABLE tbl_return_forms(id uuid PRIMARY KEY,route_id uuid);
CREATE TABLE tbl_return_form_items(return_id uuid PRIMARY KEY,form_id uuid);
CREATE TABLE tbl_tarifas_settlements(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),trip_id uuid);
''')
        for migration in ('72_return_request_origin_balance.sql','73_return_collection_contract.sql'):
            text=(ROOT/'sql'/migration).read_text(encoding='utf-8').replace('public.',self.schema+'.')
            # El test posee la transacción y mantiene todos los nombres en su esquema privado.
            text=text.replace('begin;','',1).rsplit('commit;',1)[0]
            run(connection,text)
        run(connection,'INSERT INTO tbl_app_users VALUES(%s)',[self.actor])
        run(connection,'INSERT INTO tbl_orders VALUES(%s,%s,%s)',[self.order,self.org,self.org])
        run(connection,"INSERT INTO tbl_order_items VALUES(%s,%s,1,'SKU','Producto','CAJA',10,0)",[self.item,self.order])
        run(connection,'INSERT INTO tbl_delivery_points VALUES(%s)',[self.point])
        run(connection,"INSERT INTO tbl_return_requests(id,organization_id,customer_id,status) VALUES(%s,%s,%s,'aprobada')",
            [self.request,self.org,self.org])
        run(connection,"INSERT INTO tbl_return_request_origins(request_id,order_id,delivery_point_id,snapshot) VALUES(%s,%s,%s,'{}')",
            [self.request,self.order,self.point])
        run(connection,'INSERT INTO tbl_routes VALUES(%s,%s)',[self.route,self.org])
        run(connection,'INSERT INTO tbl_dispatch_guides VALUES(%s,%s,%s,%s)',[self.guide,self.route,self.org,self.order])
        connection.commit()
        self.tables={row['table_name'] for row in run(connection,
            'SELECT table_name FROM information_schema.tables WHERE table_schema=%s',[self.schema])}
        connection.commit()

    def cleanup(self):
        for connection in self.connections:
            connection.close()
        connection=self.driver.connect(**self.options)
        try:
            # No se retira un lote que ya sea referenciado desde otro esquema.
            foreign=run(connection,"""SELECT 1 FROM pg_constraint con
 JOIN pg_class src ON src.oid=con.conrelid JOIN pg_namespace sn ON sn.oid=src.relnamespace
 JOIN pg_class dst ON dst.oid=con.confrelid JOIN pg_namespace dn ON dn.oid=dst.relnamespace
 WHERE con.contype='f' AND dn.nspname=%s AND sn.nspname<>%s""",[self.schema,self.schema])
            if foreign:
                raise AssertionError('Retirada abortada: referencias ajenas al lote aislado')
            tables={row['table_name'] for row in run(connection,
                'SELECT table_name FROM information_schema.tables WHERE table_schema=%s',[self.schema])}
            if tables!=self.tables:
                raise AssertionError('Retirada abortada: hay objetos ajenos al manifiesto')
            for table in sorted(tables):
                columns=run(connection,'SELECT column_name FROM information_schema.columns WHERE table_schema=%s AND table_name=%s',
                            [self.schema,table])
                if any(row['column_name']=='organization_id' for row in columns):
                    if run(connection,f'SELECT 1 FROM {self.schema}.{table} WHERE organization_id<>%s LIMIT 1',[self.org]):
                        raise AssertionError('Retirada abortada: datos de otra organización en el lote')
            run(connection,f'DROP SCHEMA {self.schema} CASCADE');connection.commit()
        finally:
            connection.close()


@pytest.fixture
def database():
    database=Database();database.initialize()
    try:
        yield database
    finally:
        database.cleanup()


def blocked(observer,worker_pid):
    deadline=monotonic()+3
    while monotonic()<deadline:
        if run(observer,'SELECT cardinality(pg_blocking_pids(%s)) AS n',[worker_pid])[0]['n']:
            return
        Event().wait(.01)
    raise AssertionError('No se observó el bloqueo real entre las dos conexiones')


def test_simultaneous_quantities_never_exceed_order(database):
    first,second=database.connect(),database.connect()
    lock=sql('backend/mobile/src/mobile_api/sql.py','RETURN_ORDER_LOCK_SQL')
    def reserve(connection):
        run(connection,lock,[database.order,database.org])
        balance=run(connection,'SELECT * FROM return_balance_72(%s,%s)',[database.org,database.order])[0]
        if balance['remaining']<7:
            connection.rollback();return False
        run(connection,"INSERT INTO tbl_return_request_items(id,request_id,line_number,product_code,quantity,order_item_id) VALUES(%s,%s,1,'SKU',7,%s)",
            [str(uuid4()),database.request,database.item])
        return True
    assert reserve(first)
    worker_pid=run(second,'SELECT pg_backend_pid() AS id')[0]['id']
    with ThreadPoolExecutor(max_workers=1) as pool:
        future=pool.submit(reserve,second);blocked(first,worker_pid);first.commit()
        assert future.result(timeout=5) is False
    assert run(first,'SELECT remaining FROM return_balance_72(%s,%s)',[database.org,database.order])[0]['remaining']==3


def test_duplicate_event_is_one_accepted_fact(database):
    first,second=database.connect(),database.connect()
    event_id=str(uuid4());cause=str(uuid4());payload={'schema_version':1,'attempt':'duplicate'}
    run(first,"INSERT INTO tbl_return_request_outbox(id,request_id,payload) VALUES(%s,%s,'{}')",[cause,database.request]);first.commit()
    lock=sql('backend/mobile/src/mobile_api/collections.py','REQUEST_LOCK_SQL')
    insert=sql('backend/mobile/src/mobile_api/collections.py','INSERT_EVENT_SQL')
    def accept(connection):
        run(connection,lock,[database.request,database.org])
        if run(connection,'SELECT id FROM tbl_return_collection_events WHERE id=%s',[event_id]):
            connection.commit();return 'duplicate'
        run(connection,insert,[event_id,database.request,cause,'tracking.failed',json.dumps(payload),database.actor,'2026-11-13T15:00:00Z'])
        return 'accepted'
    assert accept(first)=='accepted'
    worker_pid=run(second,'SELECT pg_backend_pid() AS id')[0]['id']
    with ThreadPoolExecutor(max_workers=1) as pool:
        future=pool.submit(accept,second);blocked(first,worker_pid);first.commit()
        assert future.result(timeout=5)=='duplicate'
    assert len(run(first,'SELECT * FROM tbl_return_collection_events'))==1


def test_receipt_waits_for_incident_and_cannot_receive_review(database):
    first,second=database.connect(),database.connect();return_id=str(uuid4())
    run(first,'INSERT INTO tbl_returns(id,organization_id,dispatch_guide_id,quantity) VALUES(%s,%s,%s,3)',
        [return_id,database.org,database.guide]);first.commit()
    run(first,sql('backend/admin/src/admin_return_incidents_sql.py','MARK_REVIEW_SQL'),[return_id,database.org])
    worker_pid=run(second,'SELECT pg_backend_pid() AS id')[0]['id']
    receive=sql('backend/admin/src/admin_returns_sql.py','RECEIVE_SQL')
    with ThreadPoolExecutor(max_workers=1) as pool:
        future=pool.submit(run,second,receive,[database.actor,3,'Bueno',return_id,database.org])
        blocked(first,worker_pid);first.commit();assert future.result(timeout=5)==[]
    second.rollback()
    assert run(first,'SELECT status FROM tbl_returns WHERE id=%s',[return_id])[0]['status']=='in_review'


def test_new_return_blocks_settlement_after_waiting_on_trip(database):
    first,second=database.connect(),database.connect()
    run(first,sql('backend/mobile/src/mobile_api/collections.py','ROUTE_LOCK_SQL'),[database.route,database.org])
    run(first,'INSERT INTO tbl_returns(organization_id,dispatch_guide_id,status) VALUES(%s,%s,%s)',[database.org,database.guide,'pending'])
    worker_pid=run(second,'SELECT pg_backend_pid() AS id')[0]['id']
    def settle():
        run(second,sql('backend/tarifas/src/returns_gate.py','LOCK_ROUTE_SQL'),[database.route])
        rows=run(second,sql('backend/tarifas/src/returns_gate.py','LOCK_RETURNS_SQL'),[database.route])
        if any(row['status'] in ('pending','approved','in_review') for row in rows):
            second.rollback();return 'blocked'
        run(second,'INSERT INTO tbl_tarifas_settlements(trip_id) VALUES(%s)',[database.route]);second.commit();return 'settled'
    with ThreadPoolExecutor(max_workers=1) as pool:
        future=pool.submit(settle);blocked(first,worker_pid);first.commit()
        assert future.result(timeout=5)=='blocked'
    assert run(first,'SELECT * FROM tbl_tarifas_settlements')==[]


def test_form_waits_for_incident_and_cannot_include_review(database):
    first,second=database.connect(),database.connect();return_id=str(uuid4())
    run(first,'INSERT INTO tbl_returns(id,organization_id,dispatch_guide_id,quantity) VALUES(%s,%s,%s,3)',
        [return_id,database.org,database.guide]);first.commit()
    run(first,sql('backend/admin/src/admin_return_incidents_sql.py','MARK_REVIEW_SQL'),[return_id,database.org])
    worker_pid=run(second,'SELECT pg_backend_pid() AS id')[0]['id']
    selected=sql('backend/admin/src/admin_returns_sql.py','SELECTED_RETURNS_SQL')+' ORDER BY rt.id FOR UPDATE OF rt'
    with ThreadPoolExecutor(max_workers=1) as pool:
        future=pool.submit(run,second,selected,[database.route,database.org,[return_id]])
        blocked(first,worker_pid);first.commit();rows=future.result(timeout=5)
    assert rows[0]['status']=='in_review' and rows[0]['form_id'] is None
    second.rollback();assert run(first,'SELECT * FROM tbl_return_forms')==[]


def test_incident_started_before_settlement_remains_a_gate_blocker(database):
    first,second=database.connect(),database.connect();return_id=str(uuid4())
    run(first,"INSERT INTO tbl_returns(id,organization_id,dispatch_guide_id,quantity,status) VALUES(%s,%s,%s,3,'received')",
        [return_id,database.org,database.guide]);first.commit()
    run(first,sql('backend/admin/src/admin_return_incidents_sql.py','MARK_REVIEW_SQL'),[return_id,database.org])
    worker_pid=run(second,'SELECT pg_backend_pid() AS id')[0]['id']
    def gate():
        run(second,sql('backend/tarifas/src/returns_gate.py','LOCK_ROUTE_SQL'),[database.route])
        rows=run(second,sql('backend/tarifas/src/returns_gate.py','LOCK_RETURNS_SQL'),[database.route])
        second.rollback();return [row['status'] for row in rows]
    with ThreadPoolExecutor(max_workers=1) as pool:
        future=pool.submit(gate);blocked(first,worker_pid);first.commit()
        assert future.result(timeout=5)==['in_review']


def test_incident_waits_for_receipt_and_preserves_received_amounts(database):
    first,second=database.connect(),database.connect();return_id=str(uuid4())
    run(first,'INSERT INTO tbl_returns(id,organization_id,dispatch_guide_id,quantity) VALUES(%s,%s,%s,3)',
        [return_id,database.org,database.guide]);first.commit()
    run(first,sql('backend/admin/src/admin_returns_sql.py','RECEIVE_SQL'),[database.actor,3,'Bueno',return_id,database.org])
    worker_pid=run(second,'SELECT pg_backend_pid() AS id')[0]['id']
    with ThreadPoolExecutor(max_workers=1) as pool:
        future=pool.submit(run,second,sql('backend/admin/src/admin_return_incidents_sql.py','MARK_REVIEW_SQL'),[return_id,database.org])
        blocked(first,worker_pid);first.commit();assert future.result(timeout=5)[0]['status']=='in_review'
    second.commit()
    row=run(first,'SELECT status,received_quantity,received_condition FROM tbl_returns WHERE id=%s',[return_id])[0]
    assert row=={'status':'in_review','received_quantity':3,'received_condition':'Bueno'}


def test_incident_waits_for_form_without_erasing_its_selection(database):
    first,second=database.connect(),database.connect();return_id,form_id=str(uuid4()),str(uuid4())
    run(first,'INSERT INTO tbl_returns(id,organization_id,dispatch_guide_id,quantity) VALUES(%s,%s,%s,3)',
        [return_id,database.org,database.guide]);first.commit()
    selected=sql('backend/admin/src/admin_returns_sql.py','SELECTED_RETURNS_SQL')+' ORDER BY rt.id FOR UPDATE OF rt'
    assert run(first,selected,[database.route,database.org,[return_id]])[0]['status']=='pending'
    run(first,'INSERT INTO tbl_return_forms VALUES(%s,%s)',[form_id,database.route])
    run(first,'INSERT INTO tbl_return_form_items VALUES(%s,%s)',[return_id,form_id])
    worker_pid=run(second,'SELECT pg_backend_pid() AS id')[0]['id']
    with ThreadPoolExecutor(max_workers=1) as pool:
        future=pool.submit(run,second,sql('backend/admin/src/admin_return_incidents_sql.py','MARK_REVIEW_SQL'),[return_id,database.org])
        blocked(first,worker_pid);first.commit();assert future.result(timeout=5)[0]['status']=='in_review'
    second.commit()
    assert str(run(first,'SELECT form_id FROM tbl_return_form_items WHERE return_id=%s',[return_id])[0]['form_id'])==form_id
    assert run(first,sql('backend/tarifas/src/returns_gate.py','OPEN_RETURNS_SQL'),[database.route])[0]['open_returns']==1


def test_return_created_after_settlement_blocks_only_a_subsequent_settlement(database):
    first,second=database.connect(),database.connect()
    run(first,sql('backend/tarifas/src/returns_gate.py','LOCK_ROUTE_SQL'),[database.route])
    assert run(first,sql('backend/tarifas/src/returns_gate.py','LOCK_RETURNS_SQL'),[database.route])==[]
    run(first,'INSERT INTO tbl_tarifas_settlements(trip_id) VALUES(%s)',[database.route])
    worker_pid=run(second,'SELECT pg_backend_pid() AS id')[0]['id']
    def add_return():
        run(second,sql('backend/mobile/src/mobile_api/collections.py','ROUTE_LOCK_SQL'),[database.route,database.org])
        run(second,"INSERT INTO tbl_returns(organization_id,dispatch_guide_id,status) VALUES(%s,%s,'pending')",[database.org,database.guide])
        second.commit()
    with ThreadPoolExecutor(max_workers=1) as pool:
        future=pool.submit(add_return);blocked(first,worker_pid);first.commit();future.result(timeout=5)
    assert len(run(first,'SELECT * FROM tbl_tarifas_settlements'))==1
    assert run(first,sql('backend/tarifas/src/returns_gate.py','OPEN_RETURNS_SQL'),[database.route])[0]['open_returns']==1


def test_incident_opened_after_settlement_does_not_rewrite_that_settlement(database):
    first,second=database.connect(),database.connect();return_id=str(uuid4())
    run(first,"INSERT INTO tbl_returns(id,organization_id,dispatch_guide_id,quantity,status) VALUES(%s,%s,%s,3,'received')",
        [return_id,database.org,database.guide]);first.commit()
    run(first,sql('backend/tarifas/src/returns_gate.py','LOCK_ROUTE_SQL'),[database.route])
    assert run(first,sql('backend/tarifas/src/returns_gate.py','LOCK_RETURNS_SQL'),[database.route])[0]['status']=='received'
    run(first,'INSERT INTO tbl_tarifas_settlements(trip_id) VALUES(%s)',[database.route])
    worker_pid=run(second,'SELECT pg_backend_pid() AS id')[0]['id']
    with ThreadPoolExecutor(max_workers=1) as pool:
        future=pool.submit(run,second,sql('backend/admin/src/admin_return_incidents_sql.py','MARK_REVIEW_SQL'),[return_id,database.org])
        blocked(first,worker_pid);first.commit();assert future.result(timeout=5)[0]['status']=='in_review'
    second.commit()
    assert len(run(first,'SELECT * FROM tbl_tarifas_settlements'))==1
    assert run(first,sql('backend/tarifas/src/returns_gate.py','OPEN_RETURNS_SQL'),[database.route])[0]['open_returns']==1
