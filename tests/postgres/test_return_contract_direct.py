"""Contrato directo real, con cantidades/peso/volumen MOCK exclusivamente aislados."""
import json
from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal
from uuid import uuid4

import pytest

from test_returns_concurrency import blocked, database, pytestmark, run, sql, ROOT


def uid():
    return str(uuid4())


@pytest.fixture
def direct(database):
    db=database
    db.country,db.warehouse,db.plan,db.trip,db.stop,db.request_item=[uid() for _ in range(6)]
    connection=db.connect()
    run(connection,'INSERT INTO tbl_warehouses VALUES(%s,%s,%s)',[db.warehouse,db.org,db.country])
    run(connection,'UPDATE tbl_orders SET warehouse_id=%s WHERE id=%s',[db.warehouse,db.order])
    run(connection,"INSERT INTO tbl_route_plans VALUES(%s,%s,%s,%s,%s,'confirmed')",
        [db.plan,db.org,db.org,db.warehouse,db.country])
    run(connection,"INSERT INTO tbl_plan_trips VALUES(%s,%s,%s,'pending',100,1,0,0)",[db.trip,db.plan,uid()])
    run(connection,"INSERT INTO tbl_plan_stops(id,trip_id,order_id,stop_type,stop_order) VALUES(%s,%s,%s,'collection',2)",
        [db.stop,db.trip,db.order])
    db.request=uid()
    run(connection,"INSERT INTO tbl_return_requests(id,organization_id,customer_id,status,collection_contract_version) VALUES(%s,%s,%s,'aprobada',2)",[db.request,db.org,db.org])
    snapshot={'warehouse_id':db.warehouse,'country_id':db.country,'latitude':9.93,'longitude':-84.08,
        'address':'MOCK ONLY - punto aislado','final_customer_name':'MOCK Cliente','planning':{
        'capacity_complete':True,'assignment_policy':'whole_request','return_warehouse_id':db.warehouse,
        'items':[{'order_item_id':db.item,'presentation':'CAJA','source_quantity':10,
                  'source_weight_kg':'25.00','source_volume_m3':'0.5000','requested_quantity':10}]}}
    run(connection,'INSERT INTO tbl_return_request_origins VALUES(%s,%s,%s,%s::jsonb)',
        [db.request,db.order,db.point,json.dumps(snapshot)])
    run(connection,"INSERT INTO tbl_return_request_items(id,request_id,line_number,product_code,quantity,order_item_id) VALUES(%s,%s,1,'SKU',10,%s)",[db.request_item,db.request,db.item])
    connection.commit()
    return db


def assign(connection,db,operation=None,trip=None,stop=None,org=None):
    operation=operation or uid()
    return str(run(connection,'SELECT assign_return_collection_v2(%s,%s,%s,%s,%s,%s) AS id',
                   [org or db.org,db.request,trip or db.trip,stop or db.stop,db.actor,operation])[0]['id'])


def bind(connection,db,allocation):
    run(connection,'UPDATE tbl_routes SET plan_trip_id=%s WHERE id=%s',[db.trip,db.route])
    run(connection,"UPDATE tbl_dispatch_guides SET stop_type='collection' WHERE id=%s",[db.guide])
    return str(run(connection,'SELECT bind_return_collection_v2(%s,%s,%s,%s,%s,%s) AS id',
                   [db.org,db.trip,db.stop,db.route,db.guide,db.actor])[0]['id'])


def collected_fact(connection,db,allocation,assignment=None):
    assignment=assignment or run(connection,'SELECT * FROM vw_return_collection_assignments WHERE allocation_id=%s',[allocation])[0]
    event,photo,signature=uid(),uid(),uid()
    run(connection,'INSERT INTO tbl_tracking_evidences VALUES(%s,%s,%s,%s,%s),(%s,%s,%s,%s,%s)',
        [photo,db.org,db.guide,'photo_product','MOCK/photo.jpg',signature,db.org,db.guide,'signature','MOCK/signature.jpg'])
    run(connection,"INSERT INTO tbl_return_collection_events VALUES(%s,%s,%s,'tracking.collected','{}',%s,now(),now())",[event,db.request,allocation,db.actor])
    return assignment,event,photo,signature


def physical_return(connection,db,quantity=6,org=None,item=None,guide=None):
    return run(connection,sql('backend/mobile/src/mobile_api/collections.py','INSERT_PHYSICAL_SQL'),
        [org or db.org,guide or db.guide,db.order,'MOCK-'+uid(),'MOCK entrega','SKU','MOCK Producto',
         quantity,'MOCK/photo.jpg',item or db.request_item,db.item])[0]['id']


def test_candidate_is_durable_without_outbox_and_legacy_is_excluded(direct):
    db=direct;connection=db.connect()
    candidates=run(connection,'SELECT * FROM vw_return_collection_candidates')
    assert len(candidates)==1 and str(candidates[0]['request_id'])==db.request
    assert candidates[0]['weight_kg']==Decimal('25') and candidates[0]['volume_m3']==Decimal('.5')
    assert candidates[0]['service_minutes']==5
    assert run(connection,"SELECT to_regclass(%s) AS name",[db.schema+'.tbl_return_request_outbox'])[0]['name'] is None


def test_future_assignment_is_whole_idempotent_and_requires_no_execution(direct):
    db=direct;connection=db.connect();operation=uid()
    assert assign(connection,db,operation)==operation
    connection.commit()
    assert assign(connection,db,operation)==operation
    connection.commit()
    rows=run(connection,'SELECT * FROM vw_return_collection_assignments')
    assert len(rows)==1 and rows[0]['quantity']==10
    assert rows[0]['route_id'] is None and rows[0]['dispatch_guide_id'] is None
    assert run(connection,'SELECT * FROM vw_return_collection_candidates')==[]
    with pytest.raises(db.driver.DatabaseError):
        assign(connection,db,operation,stop=uid())
    connection.rollback()


def test_two_planners_cannot_reserve_the_request_twice(direct):
    db=direct;first,second=db.connect(),db.connect()
    assign(first,db)
    worker_pid=run(second,'SELECT pg_backend_pid() AS id')[0]['id']
    def compete():
        try:assign(second,db)
        except db.driver.DatabaseError as error:
            second.rollback();return error.args[0]['C']
        second.commit();return 'unexpected'
    with ThreadPoolExecutor(max_workers=1) as pool:
        future=pool.submit(compete)
        try:blocked(first,worker_pid);first.commit()
        finally:first.rollback()
        assert future.result(timeout=5)=='23514'
    assert len(run(first,'SELECT * FROM tbl_return_collection_allocations'))==1
    assert len(run(first,'SELECT * FROM tbl_return_collection_assignments'))==1


@pytest.mark.parametrize('after_delivery',[True,False])
def test_capacity_uses_load_at_each_stop_and_rolls_back_everything_on_failure(direct,after_delivery):
    db=direct;connection=db.connect()
    run(connection,"INSERT INTO tbl_plan_stops(id,trip_id,order_id,stop_type,stop_order,weight,volume) VALUES(%s,%s,%s,'delivery',%s,75,.6)",
        [uid(),db.trip,db.order,1 if after_delivery else 3]);connection.commit()
    if after_delivery:
        assign(connection,db);connection.commit()
        assert len(run(connection,'SELECT * FROM tbl_return_collection_allocations'))==1
    else:
        with pytest.raises(db.driver.DatabaseError):assign(connection,db)
        connection.rollback()
        assert run(connection,'SELECT * FROM tbl_return_collection_allocations')==[]
        assert run(connection,'SELECT * FROM tbl_return_collection_events')==[]


def test_wrong_organization_cannot_assign(direct):
    db=direct;connection=db.connect()
    with pytest.raises(db.driver.DatabaseError):assign(connection,db,org=uid())
    connection.rollback()
    assert run(connection,'SELECT * FROM tbl_return_collection_allocations')==[]


def test_binding_keeps_attempts_and_rejects_a_second_guide(direct):
    db=direct;connection=db.connect();allocation=assign(connection,db);connection.commit()
    before=run(connection,'SELECT id,attempt_id FROM tbl_return_collection_assignments')
    assert bind(connection,db,allocation)==allocation;connection.commit()
    assert bind(connection,db,allocation)==allocation;connection.commit()
    assert run(connection,'SELECT id,attempt_id FROM tbl_return_collection_assignments')==before
    with pytest.raises(db.driver.DatabaseError):
        run(connection,'SELECT bind_return_collection_v2(%s,%s,%s,%s,%s,%s)',[db.org,db.trip,db.stop,db.route,uid(),db.actor])
    connection.rollback()


def test_cancel_releases_only_future_reservation_and_preserves_history(direct):
    db=direct;connection=db.connect();allocation=assign(connection,db);connection.commit();operation=uid()
    params=[db.org,allocation,db.actor,operation,'MOCK replan aislado']
    run(connection,'SELECT cancel_return_collection_v2(%s,%s,%s,%s,%s)',params);connection.commit()
    run(connection,'SELECT cancel_return_collection_v2(%s,%s,%s,%s,%s)',params);connection.commit()
    assert len(run(connection,'SELECT * FROM tbl_return_collection_events'))==2
    assert len(run(connection,'SELECT * FROM tbl_return_collection_assignments'))==1
    assert run(connection,'SELECT state FROM tbl_return_collection_allocations')[0]['state']=='cancelled'
    assert run(connection,'SELECT items FROM vw_return_collection_candidates')[0]['items'][0]['quantity']==10
    assert run(connection,'SELECT id FROM tbl_plan_stops WHERE id=%s',[db.stop])==[]


def test_partial_pickup_exposes_only_uncollected_balance_and_still_blocks_delivery(direct):
    db=direct;connection=db.connect();allocation=assign(connection,db);connection.commit()
    bind(connection,db,allocation);connection.commit()
    assignment,event,photo,signature=collected_fact(connection,db,allocation)
    run(connection,'INSERT INTO tbl_return_collection_results(attempt_id,event_id,quantity,photo_evidence_id,signature_evidence_id) VALUES(%s,%s,6,%s,%s)',[assignment['attempt_id'],event,photo,signature]);connection.commit()
    candidate=run(connection,'SELECT * FROM vw_return_collection_candidates')[0]
    assert candidate['items'][0]['quantity']==4 and candidate['weight_kg']==Decimal('10')
    assert run(connection,'SELECT state FROM tbl_return_collection_allocations')[0]['state']=='pickup_closed'
    assert run(connection,"SELECT count(*) AS n FROM vw_return_collection_assignments a JOIN tbl_return_collection_results r ON r.attempt_id=a.attempt_id WHERE a.route_id=%s AND r.quantity>0 AND r.delivered_event_id IS NULL",[db.route])[0]['n']==1
    with pytest.raises(db.driver.DatabaseError):
        run(connection,'SELECT cancel_return_collection_v2(%s,%s,%s,%s,%s)',[db.org,allocation,db.actor,uid(),'No permitido'])
    connection.rollback()


def test_evaluation_is_real_idempotent_and_rejects_changed_content(direct):
    db=direct;connection=db.connect();operation=uid()
    params=[db.org,db.request,db.actor,operation,'planning.no_candidate','MOCK no hay viaje']
    run(connection,'SELECT record_return_collection_evaluation_v2(%s,%s,%s,%s,%s,%s)',params);connection.commit()
    run(connection,'SELECT record_return_collection_evaluation_v2(%s,%s,%s,%s,%s,%s)',params);connection.commit()
    assert len(run(connection,'SELECT * FROM tbl_return_collection_events'))==1
    with pytest.raises(db.driver.DatabaseError):
        run(connection,'SELECT record_return_collection_evaluation_v2(%s,%s,%s,%s,%s,%s)',[*params[:-1],'Cambio'])
    connection.rollback()


def test_rollback_refuses_used_contract(direct):
    db=direct;connection=db.connect()
    script=(ROOT/'sql/77_return_collection_contract_rollback.sql').read_text(encoding='utf-8').replace('public.',db.schema+'.').replace("table_schema='public'",f"table_schema='{db.schema}'")
    with pytest.raises(db.driver.DatabaseError):run(connection,script)
    connection.rollback()
    assert len(run(connection,'SELECT * FROM vw_return_collection_candidates'))==1


def test_insert_cannot_pretend_goods_were_already_delivered(direct):
    db=direct;connection=db.connect();allocation=assign(connection,db);connection.commit()
    bind(connection,db,allocation);connection.commit()
    assignment,event,photo,signature=collected_fact(connection,db,allocation)
    delivered=uid()
    run(connection,"INSERT INTO tbl_return_collection_events VALUES(%s,%s,%s,'tracking.delivered','{}',%s,now(),now())",[delivered,db.request,event,db.actor])
    physical=physical_return(connection,db)
    with pytest.raises(db.driver.DatabaseError):
        run(connection,'''INSERT INTO tbl_return_collection_results
 (attempt_id,event_id,quantity,photo_evidence_id,signature_evidence_id,delivered_event_id,return_id)
 VALUES(%s,%s,6,%s,%s,%s,%s)''',[assignment['attempt_id'],event,photo,signature,delivered,physical])
    connection.rollback()


@pytest.mark.parametrize('bad_field',['org','quantity','item','guide'])
def test_delivery_cannot_link_an_incompatible_physical_return(direct,bad_field):
    db=direct;connection=db.connect();allocation=assign(connection,db);connection.commit()
    bind(connection,db,allocation);connection.commit()
    assignment,event,photo,signature=collected_fact(connection,db,allocation)
    run(connection,sql('backend/mobile/src/mobile_api/collections.py','INSERT_RESULT_SQL'),[assignment['attempt_id'],event,6,photo,signature]);connection.commit()
    delivered=uid()
    run(connection,"INSERT INTO tbl_return_collection_events VALUES(%s,%s,%s,'tracking.delivered','{}',%s,now(),now())",[delivered,db.request,event,db.actor])
    changes={'org':uid()} if bad_field=='org' else {'quantity':7} if bad_field=='quantity' else {'item':uid()} if bad_field=='item' else {'guide':uid()}
    physical=physical_return(connection,db,**changes)
    with pytest.raises(db.driver.DatabaseError):
        run(connection,sql('backend/mobile/src/mobile_api/collections.py','DELIVER_RESULT_SQL'),[delivered,physical,assignment['attempt_id']])
    connection.rollback()


def test_real_delivery_is_pending_receipt_and_keeps_settlement_blocked(direct):
    db=direct;connection=db.connect();allocation=assign(connection,db);connection.commit()
    bind(connection,db,allocation);connection.commit()
    assignment,event,photo,signature=collected_fact(connection,db,allocation)
    run(connection,sql('backend/mobile/src/mobile_api/collections.py','INSERT_RESULT_SQL'),[assignment['attempt_id'],event,6,photo,signature]);connection.commit()
    delivered=uid()
    run(connection,"INSERT INTO tbl_return_collection_events VALUES(%s,%s,%s,'tracking.delivered','{}',%s,now(),now())",[delivered,db.request,event,db.actor])
    physical=physical_return(connection,db)
    assert run(connection,sql('backend/mobile/src/mobile_api/collections.py','DELIVER_RESULT_SQL'),[delivered,physical,assignment['attempt_id']])
    connection.commit()
    assert run(connection,'SELECT status,quantity FROM tbl_returns WHERE id=%s',[physical])[0]=={'status':'pending','quantity':6}
    assert run(connection,sql('backend/tarifas/src/returns_gate.py','OPEN_COLLECTIONS_SQL'),[db.route])[0]['open_collections']==0
    assert run(connection,sql('backend/tarifas/src/returns_gate.py','OPEN_RETURNS_SQL'),[db.route])[0]['open_returns']==1


def test_partial_manual_reservation_cannot_commit(direct):
    db=direct;connection=db.connect();operation=uid()
    payload=json.dumps({'plan_trip_id':db.trip,'plan_stop_id':db.stop})
    run(connection,"INSERT INTO tbl_return_collection_events VALUES(%s,%s,NULL,'planning.assigned',%s::jsonb,%s,now(),now())",[operation,db.request,payload,db.actor])
    run(connection,'INSERT INTO tbl_return_collection_allocations(id,request_id,plan_trip_id,plan_stop_id,planned_snapshot) VALUES(%s,%s,%s,%s,%s::jsonb)',[operation,db.request,db.trip,db.stop,payload])
    run(connection,'INSERT INTO tbl_return_collection_assignments(id,allocation_id,request_item_id,attempt_id,quantity,event_id) VALUES(%s,%s,%s,%s,5,%s)',[uid(),operation,db.request_item,uid(),operation])
    with pytest.raises(db.driver.DatabaseError):connection.commit()
    connection.rollback()
    assert run(connection,'SELECT * FROM tbl_return_collection_allocations')==[]


def test_two_article_results_close_pickup_under_concurrency(direct):
    db=direct;first,second=db.connect(),db.connect()
    snapshot=run(first,'SELECT snapshot FROM tbl_return_request_origins WHERE request_id=%s',[db.request])[0]['snapshot']
    second_item,second_request_item,new_request=uid(),uid(),uid()
    run(first,"INSERT INTO tbl_order_items(id,order_id,line_number,product_code,presentation,quantity,quantity_cancelled) VALUES(%s,%s,2,'SKU-2','UNIDAD',4,0)",[second_item,db.order])
    snapshot['planning']['items'].append({'order_item_id':second_item,'source_quantity':4,'source_weight_kg':'5.00','source_volume_m3':'0.1000','presentation':'UNIDAD'})
    run(first,"INSERT INTO tbl_return_requests(id,organization_id,customer_id,status,collection_contract_version) VALUES(%s,%s,%s,'aprobada',2)",[new_request,db.org,db.org])
    run(first,'INSERT INTO tbl_return_request_origins VALUES(%s,%s,%s,%s::jsonb)',[new_request,db.order,db.point,json.dumps(snapshot)])
    run(first,'INSERT INTO tbl_return_request_items(id,request_id,line_number,product_code,quantity,order_item_id) VALUES(%s,%s,1,%s,10,%s),(%s,%s,2,%s,4,%s)',
        [uid(),new_request,'SKU',db.item,second_request_item,new_request,'SKU-2',second_item])
    db.request=new_request;first.commit()
    allocation=assign(first,db);first.commit();bind(first,db,allocation);first.commit()
    assignments=run(first,'SELECT * FROM vw_return_collection_assignments ORDER BY id');first.commit()
    a,event,photo,signature=collected_fact(first,db,allocation,assignments[0])
    run(first,sql('backend/mobile/src/mobile_api/collections.py','INSERT_RESULT_SQL'),[a['attempt_id'],event,a['quantity'],photo,signature])
    worker_pid=run(second,'SELECT pg_backend_pid() AS id')[0]['id']
    def finish_other():
        b,other_event,other_photo,other_signature=collected_fact(second,db,allocation,assignments[1])
        run(second,sql('backend/mobile/src/mobile_api/collections.py','INSERT_RESULT_SQL'),[b['attempt_id'],other_event,b['quantity'],other_photo,other_signature]);second.commit()
    with ThreadPoolExecutor(max_workers=1) as pool:
        future=pool.submit(finish_other)
        try:blocked(first,worker_pid);first.commit()
        finally:first.rollback()
        future.result(timeout=5)
    assert run(first,'SELECT state FROM tbl_return_collection_allocations')[0]['state']=='pickup_closed'
    assert len(run(first,'SELECT * FROM tbl_return_collection_results'))==2


def test_unassigned_new_collection_cannot_silently_start_as_legacy(direct):
    db=direct;connection=db.connect()
    with pytest.raises(db.driver.DatabaseError):bind(connection,db,uid())
    connection.rollback()
