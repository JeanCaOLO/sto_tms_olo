-- ============================================================================
-- 66 — Columnas de rechazo/cancelación en tbl_returns
--
-- Permite que bodega rechace una devolución no procedente o cancelada,
-- registrando motivo, quién y cuándo, desbloqueando el viaje en Liquidaciones.
--
-- Aplicar con: node --env-file=.env.local scripts/run-migration.mjs sql/66_devoluciones_rechazo.sql [--execute]
-- Deshacer con: sql/66_devoluciones_rechazo_rollback.sql
-- Idempotente.
-- ============================================================================

begin;

alter table tbl_returns
  add column if not exists rejection_reason text,
  add column if not exists rejected_by uuid,
  add column if not exists rejected_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'fk_return_rejected_by') then
    alter table tbl_returns
      add constraint fk_return_rejected_by foreign key (rejected_by) references tbl_app_users (id) on delete set null;
  end if;
end $$;

commit;
