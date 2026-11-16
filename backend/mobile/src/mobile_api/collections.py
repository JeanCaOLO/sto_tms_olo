"""Resultados de recolectas correlacionadas. Las paradas históricas no requieren el contrato nuevo."""
import json
import uuid

from . import logic
from .errors import HttpError

ASSIGNMENTS_SQL = """
SELECT a.id AS assignment_id,a.attempt_id,a.request_item_id,a.quantity AS assigned_quantity,
 a.route_id,a.dispatch_guide_id,i.request_id,i.order_item_id,i.product_code,i.product_name,i.quantity AS requested_quantity,
 ob.id AS causation_id,r.organization_id,r.customer_id,ro.order_id,
 result.quantity AS collected_quantity,result.delivered_event_id,
 ro.snapshot
FROM tbl_return_collection_assignments a
JOIN tbl_return_request_items i ON i.id=a.request_item_id
JOIN tbl_return_requests r ON r.id=i.request_id
JOIN tbl_return_request_origins ro ON ro.request_id=r.id
JOIN tbl_return_request_outbox ob ON ob.request_id=r.id
LEFT JOIN tbl_return_collection_results result ON result.attempt_id=a.attempt_id
WHERE a.dispatch_guide_id=ANY(%s::uuid[]) AND r.organization_id=%s
ORDER BY r.id,a.id
"""
REQUEST_LOCK_SQL = "SELECT id FROM tbl_return_requests WHERE id=%s AND organization_id=%s FOR UPDATE"
GUIDE_LOCK_SQL = "SELECT id FROM tbl_dispatch_guides WHERE id=%s AND organization_id=%s FOR UPDATE"
EVENT_SQL = "SELECT * FROM tbl_return_collection_events WHERE id=%s"
ATTEMPT_RESULT_SQL = "SELECT * FROM tbl_return_collection_results WHERE attempt_id=%s"
INSERT_EVENT_SQL = """
INSERT INTO tbl_return_collection_events(id,request_id,causation_id,event_type,payload,actor_id,occurred_at)
VALUES(%s,%s,%s,%s,%s::jsonb,%s,%s)
"""
PROOF_SQL = """
SELECT id FROM tbl_tracking_evidences WHERE dispatch_guide_id=%s AND organization_id=%s AND kind=%s AND client_id=%s
"""
PROOFS_SQL = """
SELECT DISTINCT ON (kind) kind,client_id FROM tbl_tracking_evidences
WHERE dispatch_guide_id=%s AND client_id IS NOT NULL AND kind IN ('photo_product','signature')
ORDER BY kind,captured_at DESC NULLS LAST,id DESC
"""
INSERT_RESULT_SQL = """
INSERT INTO tbl_return_collection_results(attempt_id,event_id,quantity,photo_evidence_id,signature_evidence_id)
VALUES(%s,%s,%s,%s,%s)
"""
UNDELIVERED_SQL = """
SELECT 1 FROM tbl_return_collection_results result
JOIN tbl_return_collection_assignments a ON a.attempt_id=result.attempt_id
WHERE a.route_id=%s AND result.quantity>0 AND result.delivered_event_id IS NULL LIMIT 1
"""
DELIVERY_RESULT_SQL = """
SELECT result.*,e.storage_key AS photo_key,w.latitude AS warehouse_lat,w.longitude AS warehouse_lng
FROM tbl_return_collection_results result
JOIN tbl_return_collection_assignments a ON a.attempt_id=result.attempt_id
JOIN tbl_return_request_items i ON i.id=a.request_item_id
JOIN tbl_return_request_origins ro ON ro.request_id=i.request_id
JOIN tbl_orders o ON o.id=ro.order_id
JOIN tbl_warehouses w ON w.id=(ro.snapshot->>'warehouse_id')::uuid AND w.organization_id=o.organization_id
JOIN tbl_tracking_evidences e ON e.id=result.photo_evidence_id AND e.dispatch_guide_id=a.dispatch_guide_id
 AND e.organization_id=o.organization_id AND e.kind='photo_product'
WHERE result.attempt_id=%s FOR UPDATE OF result
"""
INSERT_PHYSICAL_SQL = """
INSERT INTO tbl_returns(organization_id,dispatch_guide_id,order_id,return_number,return_type,reason,
 product_code,product_name,quantity,photo_url,status,request_item_id,order_item_id)
VALUES(%s,%s,%s,%s,'recolecta',%s,%s,%s,%s,%s,'pending',%s,%s) RETURNING id
"""
DELIVER_RESULT_SQL = """
UPDATE tbl_return_collection_results SET delivered_event_id=%s,return_id=%s
WHERE attempt_id=%s AND delivered_event_id IS NULL RETURNING attempt_id
"""
ROUTE_LOCK_SQL = "SELECT id FROM tbl_routes WHERE id=%s AND organization_id=%s FOR UPDATE"


def agenda(run, guides, organization_id):
    if not guides:
        return
    rows = run(ASSIGNMENTS_SQL, [[str(g['id']) for g in guides],organization_id])
    for guide in guides:
        linked = [row for row in rows if str(row['dispatch_guide_id'])==str(guide['id'])]
        if not linked:
            continue
        guide['collection'] = [{key: str(row[key]) if key.endswith('_id') and row[key] is not None else row[key] for key in (
            'assignment_id','attempt_id','request_item_id','request_id','order_item_id','product_code','product_name',
            'requested_quantity','assigned_quantity','collected_quantity','delivered_event_id')} for row in linked]
        guide['collection_proofs'] = {row['kind']:str(row['client_id']) for row in run(PROOFS_SQL,[guide['id']])}
        # La parada de recolecta usa el punto capturado, no una dirección del pedido recalculada después.
        point = linked[0]['snapshot']
        guide.update(delivery_address=point['address'],delivery_city=point.get('city'),
                     latitude=point['latitude'],longitude=point['longitude'],customer_name=point['final_customer_name'])


def execute(run, driver, guide, body, target, when, *, replay_only=False):
    assignments = run(ASSIGNMENTS_SQL, [[str(guide['id'])],driver.organization_id])
    if not assignments:
        return False
    for request_id in sorted({str(row['request_id']) for row in assignments}):
        run(REQUEST_LOCK_SQL, [request_id,driver.organization_id])
    run(GUIDE_LOCK_SQL,[guide['id'],driver.organization_id])
    assignments = run(ASSIGNMENTS_SQL, [[str(guide['id'])],driver.organization_id])
    client_id = body.get('client_id')
    if not logic.is_uuid(client_id) or body.get('schema_version') != 1 or isinstance(body.get('schema_version'),bool):
        raise HttpError(409, 'Esta recolecta requiere una app compatible con el contrato v1.',code='collection_version_required')
    raw = body.get('collection_results')
    if not isinstance(raw,list) or len(raw)!=len(assignments) or any(not isinstance(row,dict) for row in raw):
        raise HttpError(400, 'collection_results debe identificar cada artículo e intento asignado.')
    entries = {row.get('attempt_id'):row for row in raw if isinstance(row.get('attempt_id'),str)}
    if len(entries)!=len(assignments) or set(entries)!={str(row['attempt_id']) for row in assignments}:
        raise HttpError(422, 'Los intentos no corresponden a la parada asignada.')
    for assignment in assignments:
        row = entries[str(assignment['attempt_id'])]
        if any(row.get(key)!=str(assignment[key]) for key in ('request_id','request_item_id','assignment_id')):
            raise HttpError(422, 'Identidades de recolecta incompatibles.')
        quantity = row.get('collected_quantity')
        if isinstance(quantity,bool) or not isinstance(quantity,int) or not 0<=quantity<=assignment['assigned_quantity']:
            raise HttpError(422, 'La cantidad recogida supera la asignación o no es un entero válido.')
        if target=='failed' and quantity!=0:
            raise HttpError(422, 'Una recolecta fallida debe registrar cero unidades.')
        event_id = str(uuid.uuid5(uuid.NAMESPACE_URL,f"collection:{client_id.lower()}:{assignment['attempt_id']}"))
        payload = {'schema_version':1,'event_type':'tracking.failed' if target=='failed' else 'tracking.collected',
                   'stop_id':str(guide['id']),'client_id':client_id.lower(),'result':row,'occurred_at':body.get('occurred_at')}
        previous = run(EVENT_SQL,[event_id])
        if previous:
            if previous[0]['payload']!=payload:
                raise HttpError(409, 'client_id ya se usó con otro resultado de recolecta.')
            continue
        if replay_only:
            raise HttpError(409, 'El viaje cerrado solo admite reintentos ya aceptados.')
        if run(ATTEMPT_RESULT_SQL,[assignment['attempt_id']]):
            raise HttpError(409, 'El intento ya tiene un resultado aceptado.')
        proofs = []
        for kind,key in (('photo_product','photo_client_id'),('signature','signature_client_id')):
            proof = []
            if quantity>0:
                if not logic.is_uuid(row.get(key)):
                    raise HttpError(400, 'La recolecta requiere foto y firma identificadas por intento.')
                proof = run(PROOF_SQL,[guide['id'],driver.organization_id,kind,row[key]])
                if not proof:
                    raise HttpError(422, 'La evidencia no pertenece a esta parada o aún no se confirmó.')
            proofs.append(proof[0]['id'] if proof else None)
        run(INSERT_EVENT_SQL,[event_id,assignment['request_id'],assignment['causation_id'],payload['event_type'],
                              json.dumps(payload),driver.app_user_id,when])
        run(INSERT_RESULT_SQL,[assignment['attempt_id'],event_id,quantity,*proofs])
    return True


def deliver(run,driver,guide,body,when):
    """Entrega explícita al almacén; delivered genérico no llama este recorrido."""
    client_id=body.get('client_id')
    attempts=body.get('attempt_ids')
    if body.get('schema_version')!=1 or isinstance(body.get('schema_version'),bool) or not logic.is_uuid(client_id):
        raise HttpError(400,'La entrega requiere schema_version=1 y client_id UUID.')
    if not isinstance(attempts,list) or not attempts or len(attempts)>50 or any(not logic.is_uuid(value) for value in attempts):
        raise HttpError(400,'attempt_ids debe identificar los intentos entregados.')
    if len(set(attempts))!=len(attempts):
        raise HttpError(400,'No se puede repetir un intento en la entrega.')
    assignments=run(ASSIGNMENTS_SQL,[[str(guide['id'])],driver.organization_id])
    selected=[row for row in assignments if str(row['attempt_id']) in attempts]
    if len(selected)!=len(attempts) or guide.get('stop_type')!='collection':
        raise HttpError(422,'Los intentos no corresponden a esta parada de recolecta.')
    for request_id in sorted({str(row['request_id']) for row in selected}):
        run(REQUEST_LOCK_SQL,[request_id,driver.organization_id])
    run(GUIDE_LOCK_SQL,[guide['id'],driver.organization_id])
    run(ROUTE_LOCK_SQL,[guide['route_id'],driver.organization_id])
    lat,lng=logic.coords(body)
    if lat is None or lng is None:
        raise HttpError(400,'La entrega al almacén requiere ubicación.')
    reason=body.get('reason')
    if reason is not None and (not isinstance(reason,str) or len(reason)>500):
        raise HttpError(400,'El motivo de entrega debe ser texto de hasta 500 caracteres.')
    returned=[]
    for assignment in selected:
        attempt=str(assignment['attempt_id'])
        rows=run(DELIVERY_RESULT_SQL,[attempt])
        if not rows or rows[0]['quantity']<=0:
            raise HttpError(409,'El intento no tiene mercancía recogida con evidencia aceptada.')
        result=rows[0]
        payload={'schema_version':1,'client_id':client_id.lower(),'event_type':'tracking.delivered',
                 'attempt_id':attempt,'attempt_ids':sorted(attempts),'stop_id':str(guide['id']),
                 'quantity':int(result['quantity']),'lat':lat,'lng':lng,'reason':reason,'occurred_at':body.get('occurred_at')}
        event_id=str(uuid.uuid5(uuid.NAMESPACE_URL,f'collection-delivery:{client_id.lower()}:{attempt}'))
        previous=run(EVENT_SQL,[event_id])
        if previous:
            if previous[0]['payload']!=payload:
                raise HttpError(409,'client_id ya se usó con otra entrega.')
            returned.append(str(result['return_id']));continue
        if result['delivered_event_id'] is not None:
            returned.append(str(result['return_id']));continue
        distance=logic.distance_to_stop_m(lat,lng,result['warehouse_lat'],result['warehouse_lng'])
        if (distance is None or distance>logic.GEOFENCE_M) and not (reason or '').strip():
            raise HttpError(422,'Confirme el motivo de entrega cuando no se pueda verificar la ubicación del almacén.')
        run(INSERT_EVENT_SQL,[event_id,assignment['request_id'],assignment['causation_id'],'tracking.delivered',
                              json.dumps(payload),driver.app_user_id,when])
        physical=run(INSERT_PHYSICAL_SQL,[driver.organization_id,guide['id'],assignment['order_id'],f'DV-COL-{attempt}',
            'Entrega de recolecta de solicitud',assignment['product_code'],assignment['product_name'],
            result['quantity'],result['photo_key'],assignment['request_item_id'],assignment['order_item_id']])
        return_id=physical[0]['id']
        run(DELIVER_RESULT_SQL,[event_id,return_id,attempt])
        returned.append(str(return_id))
    return returned
