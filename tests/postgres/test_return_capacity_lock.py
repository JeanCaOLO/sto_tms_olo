"""El snapshot de capacidad usa líneas estables ante una actualización concurrente."""
from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal
from uuid import uuid4

from test_returns_concurrency import blocked, database, pytestmark, run, sql


def test_product_metrics_stay_locked_until_request_snapshot_is_committed(database):
    first, second = database.connect(), database.connect()
    run(first, 'ALTER TABLE tbl_order_items ADD COLUMN weight numeric, ADD COLUMN volume numeric')
    run(first, 'UPDATE tbl_order_items SET weight=25,volume=0.5 WHERE id=%s', [database.item])
    request_id = str(uuid4())
    run(first, "INSERT INTO tbl_return_requests(id,organization_id,customer_id,status) VALUES(%s,%s,%s,'aprobada')",
        [request_id, database.org, database.org])
    first.commit()
    run(first, sql('backend/admin/src/admin_return_requests_sql.py', 'ORDER_LOCK_SQL'),
        [database.order, database.org, database.org])
    rows = run(first, sql('backend/admin/src/admin_return_requests_sql.py', 'PLANNING_ITEMS_SQL'), [database.order])
    assert len(rows) == 1 and rows[0]['weight'] == Decimal('25')
    worker_pid = run(second, 'SELECT pg_backend_pid() AS id')[0]['id']

    def refresh_metrics():
        run(second, 'UPDATE tbl_order_items SET weight=100,volume=2 WHERE id=%s', [database.item])
        second.commit()

    with ThreadPoolExecutor(max_workers=1) as pool:
        future = pool.submit(refresh_metrics)
        try:
            blocked(first, worker_pid)
            # La misma transacción persiste el snapshot antes de liberar las líneas.
            run(first, '''INSERT INTO tbl_return_request_origins(request_id,order_id,delivery_point_id,snapshot)
 VALUES(%s,%s,%s,jsonb_build_object('weight',%s::numeric,'volume',%s::numeric))''',
                [request_id, database.order, database.point, rows[0]['weight'], rows[0]['volume']])
            first.commit()
        finally:
            first.rollback()
        future.result(timeout=5)
    saved = run(first, 'SELECT snapshot FROM tbl_return_request_origins WHERE request_id=%s', [request_id])[0]['snapshot']
    assert Decimal(str(saved['weight'])) == 25 and Decimal(str(saved['volume'])) == Decimal('0.5')
    updated = run(first, 'SELECT weight,volume FROM tbl_order_items WHERE id=%s', [database.item])[0]
    assert updated == {'weight': Decimal('100'), 'volume': Decimal('2')}
