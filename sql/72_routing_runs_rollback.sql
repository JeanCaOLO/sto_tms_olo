-- ============================================================================
-- 72 ROLLBACK — Retira tbl_routing_runs (revierte sql/72). BORRA el historial de corridas.
--
-- Antes, desplegar un backend de Planificación que no escriba en la tabla
-- (plan_builder.registrar_corrida). Idempotente.
-- Aplicar con: node --env-file=.env.local scripts/run-migration.mjs sql/72_routing_runs_rollback.sql [--execute]
-- ============================================================================

begin;

drop table if exists tbl_routing_runs;

commit;
