"""El preflight para Jean solo inspecciona y rechaza escrituras en PostgreSQL real."""
import pytest

from test_returns_concurrency import ROOT, database, pytestmark, run


@pytest.fixture
def inspection(database):
    connection = database.connect()
    run(connection, '''CREATE TABLE schema_migrations(
 name text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())''')
    run(connection, 'INSERT INTO schema_migrations(name,checksum) VALUES(%s,%s)',
        ['76_return_request_origin_balance.sql', 'fixture-synthetic-checksum'])
    connection.commit()
    database.tables = {row['table_name'] for row in run(connection,
        'SELECT table_name FROM information_schema.tables WHERE table_schema=%s', [database.schema])}
    connection.commit()
    script = (ROOT / 'docs/devoluciones/preflight_recolectas_bd_v2.sql').read_text(encoding='utf-8')
    # El archivo entregable inspecciona public; la prueba solo usa su esquema privado.
    script = script.replace('public.', database.schema + '.')
    script = script.replace("= 'public'", "= '" + database.schema + "'")
    return database, connection, script


def test_preflight_reads_effective_schema_without_changing_registry_or_requests(inspection):
    database, connection, script = inspection
    before = run(connection, 'SELECT * FROM schema_migrations')
    connection.commit()
    run(connection, script)
    assert run(connection, 'SELECT * FROM schema_migrations') == before
    assert len(run(connection, 'SELECT * FROM tbl_return_requests')) == 1
    assert str(run(connection, 'SELECT id FROM tbl_return_requests')[0]['id']) == database.request
    assert run(connection, "SELECT current_setting('transaction_read_only') AS value")[0]['value'] == 'off'


def test_preflight_read_only_transaction_rejects_an_accidental_write(inspection):
    database, connection, script = inspection
    altered = script.rsplit('rollback;', 1)[0] + "INSERT INTO schema_migrations(name,checksum) VALUES('must-not-exist','invalid');"
    with pytest.raises(database.driver.DatabaseError) as error:
        run(connection, altered)
    connection.rollback()
    assert error.value.args[0]['C'] == '25006'
    assert run(connection, "SELECT name FROM schema_migrations WHERE name='must-not-exist'") == []
