-- ============================================================================
-- 66 rollback — Retira columnas de rechazo en tbl_returns
-- ============================================================================

begin;

alter table tbl_returns drop constraint if exists fk_return_rejected_by;
alter table tbl_returns
  drop column if exists rejection_reason,
  drop column if exists rejected_by,
  drop column if exists rejected_at;

commit;
