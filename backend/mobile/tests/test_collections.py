"""Recolectas: identidades, saldo asignado, evidencia y reintentos tardíos."""
import json
import pytest
from conftest import ORG, GUIDE, ORDER, ROUTE, TRIP, body_of
from test_driver_api import guide_row, UUID1

TRANSITION='POST /api/mobile/v1/paradas/{id}/transicion'
POINT={'address':'Calle A','city':'Ciudad','latitude':9.93,'longitude':-84.08,'final_customer_name':'Cliente A'}


@pytest.fixture
def assignment(fake_db):
    row={'assignment_id':UUID1,'attempt_id':TRIP,'request_id':ORDER,'request_item_id':UUID1,
         'order_item_id':UUID1,'route_id':ROUTE,'dispatch_guide_id':GUIDE,'assigned_quantity':5,
         'requested_quantity':5,'product_code':'SKU','product_name':'Producto',
         'causation_id':UUID1,'organization_id':ORG,'customer_id':UUID1,'order_id':ORDER,
         'collected_quantity':None,'delivered_event_id':None,'snapshot':POINT}
    fake_db.answer('FROM tbl_dispatch_guides g JOIN tbl_routes r', [guide_row(stop_type='collection',evidence_kinds=['photo_product','signature'])])
    fake_db.answer('FROM tbl_return_collection_assignments a', [row])
    fake_db.answer('FROM tbl_dispatch_guides g WHERE g.route_id', [{'done':1,'pending':1}])
    fake_db.answer('FROM tbl_tracking_evidences WHERE dispatch_guide_id', [{'id':UUID1}])
    return row


def payload(row,**extra):
    result={key:row[key] for key in ('assignment_id','attempt_id','request_id','request_item_id')}
    result.update(collected_quantity=3,photo_client_id=UUID1,signature_client_id=UUID1)
    return {'to':'delivered','lat':9.93,'lng':-84.08,'client_id':UUID1,'schema_version':1,
            'collection_results':[{**result,**extra}]}


def test_collection_requires_explicit_version_and_exact_attempt(call,fake_db,assignment):
    body=payload(assignment);body.pop('schema_version')
    assert call(TRANSITION,path={'id':GUIDE},body=body)['statusCode']==409
    assert call(TRANSITION,path={'id':GUIDE},body=payload(assignment,attempt_id=UUID1))['statusCode']==422
    assert call(TRANSITION,path={'id':GUIDE},body=payload(assignment,collected_quantity=6))['statusCode']==422
    assert not fake_db.wrote('INSERT INTO tbl_return_collection_results')


def test_result_requires_own_confirmed_evidence_and_records_partial_only_once(call,fake_db,assignment):
    fake_db.answer('FROM tbl_tracking_evidences WHERE dispatch_guide_id', [])
    assert call(TRANSITION,path={'id':GUIDE},body=payload(assignment))['statusCode']==422
    fake_db.answer('FROM tbl_tracking_evidences WHERE dispatch_guide_id', [{'id':UUID1}])
    assert call(TRANSITION,path={'id':GUIDE},body=payload(assignment))['statusCode']==200
    inserted=fake_db.wrote('INSERT INTO tbl_return_collection_events')[0][1]
    saved=json.loads(inserted[4]);assert saved['result']['collected_quantity']==3
    fake_db.answer('SELECT * FROM tbl_return_collection_events', [{'payload':saved}])
    assert call(TRANSITION,path={'id':GUIDE},body=payload(assignment))['statusCode']==200
    assert len(fake_db.wrote('INSERT INTO tbl_return_collection_results'))==1
    assert call(TRANSITION,path={'id':GUIDE},body=payload(assignment,collected_quantity=4))['statusCode']==409
    assert not fake_db.wrote('INSERT INTO tbl_returns')  # recoger no es entregar ni recibir


def test_late_retry_on_closed_trip_does_not_create_result(call,fake_db,assignment):
    fake_db.answer('FROM tbl_dispatch_guides g JOIN tbl_routes r', [guide_row(stop_type='collection',route_status='Completada',delivery_status='delivered')])
    assert call(TRANSITION,path={'id':GUIDE},body=payload(assignment))['statusCode']==409
    assert not fake_db.wrote('INSERT INTO tbl_return_collection_results')


DELIVER='POST /api/mobile/v1/paradas/{id}/recolectas/entregar'


def test_delivery_creates_one_pending_return_with_exact_attempt_photo(call,fake_db,assignment):
    stored={'quantity':3,'photo_key':'pedidos/ORDER/photo-product-attempt.jpg','warehouse_lat':9.93,
            'warehouse_lng':-84.08,'return_id':None,'delivered_event_id':None}
    fake_db.answer('FROM tbl_return_collection_results result JOIN tbl_return_collection_assignments',lambda params:[dict(stored)])
    fake_db.answer('INSERT INTO tbl_returns', [{'id':UUID1}])
    def update(params):
        stored.update(delivered_event_id=params[0],return_id=params[1]);return [{'attempt_id':TRIP}]
    fake_db.answer('UPDATE tbl_return_collection_results',update)
    body={'schema_version':1,'client_id':UUID1,'attempt_ids':[TRIP],'lat':9.93,'lng':-84.08}
    response=call(DELIVER,path={'id':GUIDE},body=body)
    assert response['statusCode']==200 and body_of(response)['data']['return_ids']==[UUID1]
    insert=fake_db.wrote('INSERT INTO tbl_returns')[0]
    assert "'pending'" in insert[0] and "'recolecta'" in insert[0]
    assert insert[1][7:]==[3,stored['photo_key'],assignment['request_item_id'],assignment['order_item_id']]
    assert call(DELIVER,path={'id':GUIDE},body=body)['statusCode']==200
    assert call(DELIVER,path={'id':GUIDE},body={**body,'client_id':TRIP})['statusCode']==200
    assert len(fake_db.wrote('INSERT INTO tbl_returns'))==1
    assert not fake_db.wrote('UPDATE tbl_returns')


def test_delivery_rejects_wrong_attempt_unconfirmed_pickup_and_missing_warehouse_reason(call,fake_db,assignment):
    body={'schema_version':1,'client_id':UUID1,'attempt_ids':[UUID1],'lat':9.93,'lng':-84.08}
    assert call(DELIVER,path={'id':GUIDE},body=body)['statusCode']==422
    body['attempt_ids']=[TRIP]
    assert call(DELIVER,path={'id':GUIDE},body=body)['statusCode']==409
    fake_db.answer('FROM tbl_return_collection_results result JOIN tbl_return_collection_assignments',[{
        'quantity':3,'photo_key':'own-photo','warehouse_lat':None,'warehouse_lng':None,
        'return_id':None,'delivered_event_id':None}])
    assert call(DELIVER,path={'id':GUIDE},body=body)['statusCode']==422
    assert not fake_db.wrote('INSERT INTO tbl_returns')


def test_agenda_keeps_trip_with_goods_in_transit_before_next_plan():
    from mobile_api.trips import _current
    current={'id':'current','progress':{'remaining':0},'pending_collection_delivery':True}
    following={'id':'next','progress':{'remaining':2}}
    assert _current([current,following])==[current]
