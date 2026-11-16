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
SELECT id,return_id,explanation,reported_by,reported_at,previous_status,
       previous_received_quantity,previous_received_condition
FROM tbl_return_incidents WHERE organization_id = %s AND return_id = %s
ORDER BY reported_at DESC,id DESC LIMIT %s OFFSET %s
"""
