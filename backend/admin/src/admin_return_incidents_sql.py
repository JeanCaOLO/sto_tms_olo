"""Historial inmutable de novedades. La fila de devolución serializa recepción y revisión."""
FIND_ATTEMPT_SQL = """
SELECT * FROM tbl_return_incidents
WHERE organization_id = %s AND return_id = %s AND reported_by = %s AND request_key = %s
"""
INSERT_INCIDENT_SQL = """
INSERT INTO tbl_return_incidents
 (id,organization_id,return_id,request_key,explanation,reported_by,previous_status,
  previous_received_quantity,previous_received_condition)
VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
RETURNING *
"""
MARK_REVIEW_SQL = """
UPDATE tbl_returns SET status = 'in_review', updated_at = now()
WHERE id = %s AND organization_id = %s AND COALESCE(status,'pending') IN ('pending','approved','received','completed')
RETURNING id,status
"""
HISTORY_SQL = """
SELECT i.id,i.return_id,i.explanation,i.reported_by,i.reported_at,i.previous_status,
       i.previous_received_quantity,i.previous_received_condition,
       x.id AS resolution_id,x.outcome AS resolution_outcome,x.note AS resolution_note,
       x.resolved_by,x.resolved_at,x.resulting_status
FROM tbl_return_incidents i
LEFT JOIN tbl_return_incident_resolutions x ON x.incident_id = i.id
WHERE i.organization_id = %s AND i.return_id = %s
ORDER BY i.reported_at DESC,i.id DESC LIMIT %s OFFSET %s
"""
LATEST_INCIDENT_SQL = """
SELECT id,previous_status,previous_received_quantity,previous_received_condition
FROM tbl_return_incidents WHERE organization_id = %s AND return_id = %s
ORDER BY reported_at DESC,id DESC LIMIT 1
"""
FIND_RESOLUTION_SQL = """
SELECT * FROM tbl_return_incident_resolutions
WHERE organization_id = %s AND return_id = %s AND resolved_by = %s AND request_key = %s
"""
INSERT_RESOLUTION_SQL = """
INSERT INTO tbl_return_incident_resolutions
 (id,organization_id,return_id,incident_id,request_key,outcome,note,resolved_by,resulting_status,
  resulting_received_quantity,resulting_received_condition)
VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
RETURNING *
"""
# Solo sale de revisión con la resolución ya insertada en la misma transacción (trigger de SQL71).
LEAVE_REVIEW_SQL = """
UPDATE tbl_returns
SET status = %s, received_quantity = %s, received_condition = %s,
    received_at = CASE WHEN %s THEN now() ELSE received_at END,
    received_by = CASE WHEN %s THEN %s::uuid ELSE received_by END,
    updated_at = now()
WHERE id = %s AND organization_id = %s AND status = 'in_review'
RETURNING id,status,received_at,received_quantity,received_condition
"""
