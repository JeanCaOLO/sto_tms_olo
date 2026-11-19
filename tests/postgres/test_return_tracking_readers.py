"""Compila lectores reales contra nombres/tipos efectivos y datos solo MOCK locales."""
import re
import runpy

import pytest

from test_returns_concurrency import ROOT, database, pytestmark, run
from test_return_contract_direct import direct, assign, bind, uid


def extend_schema(db,connection):
    run(connection,(ROOT/'tests/postgres/tracking_read_schema.sql').read_text(encoding='utf-8'))
    connection.commit()
    db.tables={row['table_name'] for row in run(connection,
        'SELECT table_name FROM information_schema.tables WHERE table_schema=%s',[db.schema])}
    connection.commit()


@pytest.mark.parametrize('path,name',[
 ('backend/tracking/src/tracking_sql.py','GUIDES_SQL'),
 ('backend/tracking/src/tracking_sql.py','MY_PLANNED_STOPS_SQL'),
 ('backend/tracking/src/tracking_sql.py','STOPS_BATCH_SQL'),
 ('backend/mobile/src/mobile_api/sql.py','GUIDES_BY_ROUTES_SQL'),
 ('backend/mobile/src/mobile_api/sql.py','MY_PLANNED_STOPS_SQL'),
 ('backend/mobile/src/mobile_api/sql.py','GUIDE_ROW_SQL'),
])
def test_reader_sql_compiles_against_effective_column_names(database,path,name):
    connection=database.connect();extend_schema(database,connection)
    statement=runpy.run_path(str(ROOT/path))[name]
    params=[]
    for match in re.finditer('%s',statement):
        params.append([database.route] if re.search(r'ANY\(\s*$',statement[:match.start()],re.I) else database.route)
    assert run(connection,'EXPLAIN '+statement,params)


@pytest.mark.parametrize('path,name',[
 ('backend/tracking/src/tracking_sql.py','GUIDES_SQL'),
 ('backend/mobile/src/mobile_api/sql.py','GUIDES_BY_ROUTES_SQL'),
])
def test_delivery_and_pickup_of_same_order_do_not_duplicate_guide_or_change_snapshot(direct,path,name):
    db=direct;connection=db.connect();extend_schema(db,connection)
    run(connection,"UPDATE tbl_orders SET delivery_address='MOCK direccion antigua',delivery_latitude=1,delivery_longitude=2 WHERE id=%s",[db.order])
    run(connection,"INSERT INTO tbl_plan_stops(id,trip_id,order_id,stop_type,stop_order,weight,volume) VALUES(%s,%s,%s,'delivery',1,1,.1)",[uid(),db.trip,db.order]);connection.commit()
    allocation=assign(connection,db);connection.commit();bind(connection,db,allocation);connection.commit()
    statement=runpy.run_path(str(ROOT/path))[name]
    rows=run(connection,statement,[[db.route]] if name=='GUIDES_BY_ROUTES_SQL' else [db.route])
    assert len(rows)==1
    assert rows[0]['delivery_address']=='MOCK ONLY - punto aislado'
    assert float(rows[0]['latitude'])==9.93 and float(rows[0]['longitude'])==-84.08
