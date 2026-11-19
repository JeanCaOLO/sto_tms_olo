"""SQL71 y gate de producción con dos conexiones a PostgreSQL local desechable.

Reutiliza el destino y la retirada protegidos del arnés. El esquema sigue siendo
mínimo: no acredita el contrato directo futuro, SQL70 completo ni el recorrido APK.
"""
import importlib.util
from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4

import pytest

from test_returns_concurrency import ROOT, blocked, database, pytestmark, run, sql


@pytest.fixture
def gate(monkeypatch):
    monkeypatch.syspath_prepend(str(ROOT / 'backend/common-services/layers/tms_common'))
    monkeypatch.syspath_prepend(str(ROOT / 'backend/tarifas/src'))
    spec = importlib.util.spec_from_file_location(
        'isolated_returns_gate', ROOT / 'backend/tarifas/src/returns_gate.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    def reject_external_query(*args, **kwargs):
        raise AssertionError('El gate debe usar exclusivamente la conexión local inyectada')

    monkeypatch.setattr(module.tarifas_db, 'query', reject_external_query)
    monkeypatch.setenv('TMS_RETURNS_GATE', 'on')
    return module


@pytest.fixture
def resolution_database(database):
    connection = database.connect()
    run(connection, '''
CREATE TABLE tbl_organizations(id uuid PRIMARY KEY);
ALTER TABLE tbl_app_users ADD COLUMN IF NOT EXISTS organization_id uuid;
CREATE TABLE tbl_return_incidents(
 id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES tbl_organizations(id),
 return_id uuid NOT NULL REFERENCES tbl_returns(id), request_key uuid NOT NULL,
 explanation text NOT NULL, reported_by uuid NOT NULL REFERENCES tbl_app_users(id),
 previous_status text, previous_received_quantity integer, previous_received_condition text,
 reported_at timestamptz NOT NULL DEFAULT now());
''')
    run(connection, 'INSERT INTO tbl_organizations VALUES(%s)', [database.org])
    run(connection, 'UPDATE tbl_app_users SET organization_id=%s', [database.org])
    migration = (ROOT / 'sql/75_return_incident_resolutions.sql').read_text(encoding='utf-8')
    migration = migration.replace('public.', database.schema + '.')
    migration = migration.replace('begin;', '', 1).rsplit('commit;', 1)[0]
    run(connection, migration)
    database.return_id, database.incident_id = str(uuid4()), str(uuid4())
    run(connection, '''INSERT INTO tbl_returns
 (id,organization_id,dispatch_guide_id,quantity,status) VALUES(%s,%s,%s,3,'in_review')''',
        [database.return_id, database.org, database.guide])
    run(connection, sql('backend/admin/src/admin_return_incidents_sql.py', 'INSERT_INCIDENT_SQL'),
        [database.incident_id, database.org, database.return_id, str(uuid4()),
         'Fixture sintético: falta una caja', database.actor, 'pending', None, None])
    connection.commit()
    database.tables = {row['table_name'] for row in run(connection,
        'SELECT table_name FROM information_schema.tables WHERE table_schema=%s', [database.schema])}
    connection.commit()
    return database


def accept_resolution(connection, database):
    run(connection, sql('backend/admin/src/admin_return_incidents_sql.py', 'INSERT_RESOLUTION_SQL'),
        [str(uuid4()), database.org, database.return_id, database.incident_id, str(uuid4()),
         'accepted', 'Aceptación sintética de dos cajas', database.actor, 'received', 2, 'Bueno'])
    run(connection, sql('backend/admin/src/admin_return_incidents_sql.py', 'LEAVE_REVIEW_SQL'),
        ['received', 2, 'Bueno', True, True, database.actor, database.return_id, database.org])


def settle(connection, database, gate):
    try:
        gate.recheck(lambda statement, params: run(connection, statement, params),
                     [{'op': 'insert', 'table': gate.SETTLEMENTS,
                       'values': {'trip_id': database.route}}])
    except gate.HttpError as error:
        connection.rollback()
        assert error.status == 409
        return 'blocked'
    run(connection, 'INSERT INTO tbl_tarifas_settlements(trip_id) VALUES(%s)', [database.route])
    connection.commit()
    return 'settled'


@pytest.mark.parametrize('other_pending', [False, True])
def test_settlement_waits_for_resolution_and_rechecks_remaining_returns(resolution_database, gate, other_pending):
    db = resolution_database
    first, second = db.connect(), db.connect()
    if other_pending:
        run(first, '''INSERT INTO tbl_returns(organization_id,dispatch_guide_id,quantity,status)
 VALUES(%s,%s,1,'pending')''', [db.org, db.guide])
        first.commit()
    accept_resolution(first, db)
    worker_pid = run(second, 'SELECT pg_backend_pid() AS id')[0]['id']
    with ThreadPoolExecutor(max_workers=1) as pool:
        future = pool.submit(settle, second, db, gate)
        try:
            blocked(first, worker_pid)
            first.commit()
        finally:
            first.rollback()
        assert future.result(timeout=5) == ('blocked' if other_pending else 'settled')
    assert len(run(first, 'SELECT * FROM tbl_tarifas_settlements')) == (0 if other_pending else 1)
    row = run(first, 'SELECT status,received_quantity FROM tbl_returns WHERE id=%s', [db.return_id])[0]
    assert row == {'status': 'received', 'received_quantity': 2}
    assert len(run(first, 'SELECT * FROM tbl_return_incident_resolutions')) == 1


def test_resolution_waits_for_gate_and_only_later_settlement_can_succeed(resolution_database, gate):
    db = resolution_database
    first, second = db.connect(), db.connect()
    with pytest.raises(gate.HttpError) as error:
        gate.recheck(lambda statement, params: run(first, statement, params),
                     [{'op': 'insert', 'table': gate.SETTLEMENTS, 'values': {'trip_id': db.route}}])
    assert error.value.status == 409
    worker_pid = run(second, 'SELECT pg_backend_pid() AS id')[0]['id']

    def resolve():
        accept_resolution(second, db)
        second.commit()

    with ThreadPoolExecutor(max_workers=1) as pool:
        future = pool.submit(resolve)
        try:
            blocked(first, worker_pid)
        finally:
            first.rollback()
        future.result(timeout=5)
    assert run(first, 'SELECT * FROM tbl_tarifas_settlements') == []
    first.rollback()
    assert settle(first, db, gate) == 'settled'


def test_two_resolutions_cannot_accept_the_same_incident_twice(resolution_database):
    db = resolution_database
    first, second = db.connect(), db.connect()
    accept_resolution(first, db)
    worker_pid = run(second, 'SELECT pg_backend_pid() AS id')[0]['id']

    def resolve_again():
        try:
            accept_resolution(second, db)
        except db.driver.DatabaseError as error:
            second.rollback()
            return error.args[0]['C']
        second.commit()
        return 'accepted'

    with ThreadPoolExecutor(max_workers=1) as pool:
        future = pool.submit(resolve_again)
        try:
            blocked(first, worker_pid)
            first.commit()
        finally:
            first.rollback()
        assert future.result(timeout=5) == '23514'
    assert len(run(first, 'SELECT * FROM tbl_return_incident_resolutions')) == 1


def test_deferred_resolution_guard_rolls_back_an_incomplete_transaction(resolution_database):
    db = resolution_database
    connection = db.connect()
    run(connection, sql('backend/admin/src/admin_return_incidents_sql.py', 'INSERT_RESOLUTION_SQL'),
        [str(uuid4()), db.org, db.return_id, db.incident_id, str(uuid4()),
         'accepted', 'Fixture sin transición de estado', db.actor, 'received', 2, 'Bueno'])
    with pytest.raises(db.driver.DatabaseError) as error:
        connection.commit()
    connection.rollback()
    assert error.value.args[0]['C'] == '23514'
    assert run(connection, 'SELECT * FROM tbl_return_incident_resolutions') == []
    assert run(connection, 'SELECT status FROM tbl_returns WHERE id=%s', [db.return_id])[0]['status'] == 'in_review'


def test_disabled_gate_preserves_settlement_behavior_with_unresolved_incident(resolution_database, gate, monkeypatch):
    db = resolution_database
    monkeypatch.setenv('TMS_RETURNS_GATE', 'off')
    connection = db.connect()
    assert settle(connection, db, gate) == 'settled'
    assert run(connection, 'SELECT status FROM tbl_returns WHERE id=%s', [db.return_id])[0]['status'] == 'in_review'
    assert run(connection, 'SELECT * FROM tbl_return_incident_resolutions') == []
