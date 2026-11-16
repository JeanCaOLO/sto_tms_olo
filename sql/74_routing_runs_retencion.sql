-- ============================================================================
-- 74 — Retención del registro de corridas del motor de ruteo (2026-11-16).
--
-- tbl_routing_runs (sql/72) crece ≈ 70 filas por día hábil con JSON de entrada y
-- resultado. Planificación borra las filas de más de ROUTING_RUNS_RETENCION_DIAS
-- (90 por defecto) una vez al día, en el replan programado (retencion.purgar).
-- Para eso tms_app necesita DELETE en esa tabla (sigue sin UPDATE: nadie reescribe un
-- registro). El índice idx_routing_runs_created_at (sql/72) cubre el borrado.
--
-- Aplicar con: node --env-file=.env.local scripts/run-migration.mjs sql/74_routing_runs_retencion.sql [--execute]
-- Deshacer con: sql/74_routing_runs_retencion_rollback.sql
-- Idempotente.
-- ============================================================================

begin;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'tms_app') then
    grant delete on public.tbl_routing_runs to tms_app;
  else
    raise notice 'tms_app no existe: se omite el GRANT (correr sql/18 primero)';
  end if;
end;
$$;

comment on table tbl_routing_runs is
  'Una fila por corrida del motor de ruteo (compania, dia): entrada, resultado y parametros, para explicar y reproducir el plan (ADR-005, ADR-007). Sin UPDATE; se borran las filas de mas de ROUTING_RUNS_RETENCION_DIAS (sql/74).';

commit;
