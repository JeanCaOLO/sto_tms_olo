-- ============================================================================
-- 61 ROLLBACK — vuelve ck_return_status al de sql/60 (sin 'completed'). Idempotente.
-- Las filas que ya estén en 'completed' se conservan: el CHECK se agrega NOT VALID (no revisa lo existente).
-- ============================================================================

begin;

alter table tbl_returns drop constraint if exists ck_return_status;
alter table tbl_returns
  add constraint ck_return_status
  check (status in ('pending', 'approved', 'received', 'rejected', 'cancelled')) not valid;

commit;
