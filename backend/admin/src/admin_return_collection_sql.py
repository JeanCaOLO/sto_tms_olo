"""Persistencia del productor y de los acuses returns.collection.v1; no agenda viajes."""

ENQUEUE_SQL = """
WITH event AS (SELECT gen_random_uuid() AS id)
INSERT INTO tbl_return_request_outbox(id,request_id,payload)
SELECT event.id,r.id,jsonb_build_object(
 'schema_version',1,'event_id',event.id,'event_type','returns.collection.requested',
 'request_id',r.id,'organization_id',r.organization_id,'customer_id',r.customer_id,
 'occurred_at',r.created_at,'origin',o.snapshot,
 'items',(SELECT jsonb_agg(jsonb_build_object('request_item_id',i.id,'order_item_id',i.order_item_id,
   'product_code',i.product_code,'product_name',i.product_name,'presentation',oi.presentation,
   'requested_quantity',i.quantity) ORDER BY i.line_number)
   FROM tbl_return_request_items i JOIN tbl_order_items oi ON oi.id=i.order_item_id WHERE i.request_id=r.id))
FROM tbl_return_requests r JOIN tbl_return_request_origins o ON o.request_id=r.id CROSS JOIN event
WHERE r.id=%s AND r.status='aprobada'
ON CONFLICT(request_id) DO NOTHING RETURNING id
"""

CLAIM_SQL = """
WITH candidates AS (
 SELECT ob.id FROM tbl_return_request_outbox ob
 JOIN tbl_return_requests r ON r.id=ob.request_id
 JOIN tbl_customers c ON c.id=r.customer_id
 LEFT JOIN tbl_warehouses w ON w.id=c.warehouse_id AND w.organization_id=r.organization_id
 WHERE ({access}) AND ob.status IN ('pending','leased') AND ob.attempts<8
 AND ob.available_at<=now() AND (ob.lease_until IS NULL OR ob.lease_until<=now())
 ORDER BY ob.created_at,ob.id LIMIT 25 FOR UPDATE OF ob SKIP LOCKED
)
UPDATE tbl_return_request_outbox ob SET status='leased',attempts=ob.attempts+1,
 lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes',
 available_at=now()+make_interval(secs=>least(3600,30*power(2,ob.attempts)::int))
FROM candidates WHERE ob.id=candidates.id
RETURNING ob.id,ob.request_id,ob.payload,ob.lease_token,ob.lease_until,ob.attempts
"""
EXHAUST_SQL = """
UPDATE tbl_return_request_outbox ob SET status='failed',last_error='ack_timeout'
FROM tbl_return_requests r JOIN tbl_customers c ON c.id=r.customer_id
LEFT JOIN tbl_warehouses w ON w.id=c.warehouse_id AND w.organization_id=r.organization_id
WHERE ob.request_id=r.id AND ({access}) AND ob.status='leased' AND ob.attempts>=8 AND ob.lease_until<=now()
"""
OUTBOX_SQL = "SELECT * FROM tbl_return_request_outbox WHERE request_id=%s FOR UPDATE"
EVENT_SQL = "SELECT * FROM tbl_return_collection_events WHERE id=%s"
INSERT_EVENT_SQL = """
INSERT INTO tbl_return_collection_events(id,request_id,causation_id,event_type,payload,actor_id,occurred_at)
VALUES(%s,%s,%s,%s,%s::jsonb,%s,%s) RETURNING id
"""
ACK_SQL = """
UPDATE tbl_return_request_outbox SET status='acknowledged',ack_event_id=%s,acknowledged_at=now(),
 last_error=NULL WHERE id=%s AND lease_token=%s AND status='leased' RETURNING id
"""
RETRY_SQL = """
UPDATE tbl_return_request_outbox SET status='pending',attempts=0,available_at=now(),lease_token=NULL,
 lease_until=NULL,last_error=NULL WHERE request_id=%s AND status='failed' RETURNING id
"""
ASSIGNMENT_GUIDE_SQL = """
SELECT g.id FROM tbl_dispatch_guides g JOIN tbl_routes r ON r.id=g.route_id
JOIN tbl_orders o ON o.id=g.order_id
JOIN tbl_return_request_origins ro ON ro.order_id=o.id
JOIN tbl_return_requests rq ON rq.id=ro.request_id AND rq.customer_id=o.customer_id
WHERE rq.id=%s AND g.id=%s AND g.route_id=%s AND g.organization_id=rq.organization_id
 AND r.organization_id=rq.organization_id AND o.organization_id=rq.organization_id
 AND g.stop_type='collection' AND lower(coalesce(g.delivery_status,'pending'))='pending'
 AND lower(r.status) NOT IN ('completada','completed','cancelled','cancelada') FOR UPDATE OF g
"""
ASSIGNABLE_SQL = """
SELECT i.id,i.quantity-coalesce((SELECT sum(coalesce(result.quantity,a.quantity))
 FROM tbl_return_collection_assignments a LEFT JOIN tbl_return_collection_results result ON result.attempt_id=a.attempt_id
 WHERE a.request_item_id=i.id),0) AS remaining
FROM tbl_return_request_items i WHERE i.request_id=%s AND i.id=%s
"""
GUIDE_ORIGIN_SQL = """
SELECT 1 FROM tbl_return_collection_assignments a
JOIN tbl_return_request_items i ON i.id=a.request_item_id
JOIN tbl_return_request_origins ro ON ro.request_id=i.request_id
JOIN tbl_return_request_origins incoming ON incoming.request_id=%s
WHERE a.dispatch_guide_id=%s AND ro.delivery_point_id<>incoming.delivery_point_id LIMIT 1
"""
ROUTE_LOCK_SQL = "SELECT id FROM tbl_routes WHERE id=%s AND organization_id=%s FOR UPDATE"
INSERT_ASSIGNMENT_SQL = """
INSERT INTO tbl_return_collection_assignments(id,request_item_id,attempt_id,route_id,dispatch_guide_id,quantity,event_id)
VALUES(%s,%s,%s,%s,%s,%s,%s) RETURNING id
"""
