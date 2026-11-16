-- ============================================================================
-- 74 ROLLBACK — Quita a tms_app el DELETE sobre tbl_routing_runs (revierte sql/74).
-- Antes, desplegar un Planificación que no purgue (ROUTING_RUNS_RETENCION_DIAS=0).
-- Aplicar con: node --env-file=.env.local scripts/run-migration.mjs sql/74_routing_runs_retencion_rollback.sql [--execute]
-- ============================================================================

begin;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'tms_app') then
    revoke delete on public.tbl_routing_runs from tms_app;
  end if;
end;
$$;

commit;
