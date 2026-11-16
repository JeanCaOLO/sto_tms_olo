"""Seguimiento derivado de acuses y resultados aceptados; no interpreta el estado genérico de una guía."""

PROGRESS_SQL = """
SELECT r.id AS request_id,ob.status AS delivery_status,ob.last_error,
 ro.snapshot AS origin,
 greatest(ob.created_at,ob.acknowledged_at,(SELECT max(rt.updated_at) FROM tbl_returns rt
   JOIN tbl_return_request_items i ON i.id=rt.request_item_id WHERE i.request_id=r.id),(SELECT max(e.accepted_at)
   FROM tbl_return_collection_events e WHERE e.request_id=r.id)) AS operational_updated_at,
 (SELECT e.event_type FROM tbl_return_collection_events e WHERE e.request_id=r.id
  AND e.event_type IN ('planning.no_candidate','planning.failed','planning.assigned','planning.received')
  ORDER BY e.occurred_at DESC,e.accepted_at DESC,e.id DESC LIMIT 1) AS planning_issue,
 (SELECT jsonb_agg(jsonb_build_object('request_item_id',i.id,'product_code',i.product_code,
   'presentation',oi.presentation,'requested',i.quantity,
   'assigned',coalesce((SELECT sum(a.quantity) FROM tbl_return_collection_assignments a
     LEFT JOIN tbl_return_collection_results result ON result.attempt_id=a.attempt_id
     WHERE a.request_item_id=i.id AND result.attempt_id IS NULL),0),
   'collected',coalesce((SELECT sum(result.quantity) FROM tbl_return_collection_assignments a
     JOIN tbl_return_collection_results result ON result.attempt_id=a.attempt_id WHERE a.request_item_id=i.id),0),
   'delivered',coalesce((SELECT sum(result.quantity) FROM tbl_return_collection_assignments a
     JOIN tbl_return_collection_results result ON result.attempt_id=a.attempt_id
     WHERE a.request_item_id=i.id AND result.delivered_event_id IS NOT NULL),0),
   'received',coalesce((SELECT sum(rt.received_quantity) FROM tbl_returns rt WHERE rt.request_item_id=i.id AND rt.status='received'),0)
 ) ORDER BY i.line_number) FROM tbl_return_request_items i LEFT JOIN tbl_order_items oi ON oi.id=i.order_item_id
 WHERE i.request_id=r.id) AS item_progress,
 (SELECT jsonb_agg(jsonb_build_object('assignment_id',a.id,'attempt_id',a.attempt_id,
   'request_item_id',i.id,'route_id',a.route_id,'stop_id',a.dispatch_guide_id,
   'assigned_quantity',a.quantity,'collected_quantity',result.quantity,
   'delivered',result.delivered_event_id IS NOT NULL,'return_id',result.return_id)
   ORDER BY a.created_at,a.id)
  FROM tbl_return_collection_assignments a JOIN tbl_return_request_items i ON i.id=a.request_item_id
  LEFT JOIN tbl_return_collection_results result ON result.attempt_id=a.attempt_id
  WHERE i.request_id=r.id) AS tracking
FROM tbl_return_requests r
LEFT JOIN tbl_return_request_outbox ob ON ob.request_id=r.id
LEFT JOIN tbl_return_request_origins ro ON ro.request_id=r.id
WHERE r.id=ANY(%s::uuid[])
"""


def status(row):
    items=row.get('item_progress') or []
    if not row.get('delivery_status'):
        return 'legacy'
    if items and all(item['delivered']>=item['requested'] for item in items):
        return 'delivered'
    if any(item['assigned']>0 or item['collected']>item['delivered'] for item in items):
        return 'tracking'
    if any(item['delivered']>0 for item in items):
        return 'partially_delivered'
    if row.get('delivery_status')=='failed':
        return 'delivery_failed'
    if row.get('delivery_status')=='pending':
        return 'pending_send'
    if row.get('delivery_status')=='leased':
        return 'awaiting_ack'
    if row.get('planning_issue')=='planning.no_candidate':
        return 'no_candidate'
    if row.get('planning_issue')=='planning.failed':
        return 'planning_failed'
    return 'planning'


def attach(run,requests):
    if not requests:
        return requests
    by_id={str(row['request_id']):row for row in run(PROGRESS_SQL,[[str(row['id']) for row in requests]])}
    for request in requests:
        facts=by_id.get(str(request['id']))
        if facts:
            request.update({key:value for key,value in facts.items() if key!='request_id'})
            request['operational_status']=status(facts)
    return requests
