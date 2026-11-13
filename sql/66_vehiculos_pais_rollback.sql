-- ============================================================================
-- 66 ROLLBACK — Retira tbl_vehicles.country_id (revierte sql/66).
--
-- OJO: el backend de Planificación desde la rama motor-ruteo-fase4 filtra la flota por
-- esta columna (plan_builder._FLOTA). Desplegar antes un backend que no la use.
-- Idempotente (if exists).
-- Aplicar con: node --env-file=.env.local scripts/run-migration.mjs sql/66_vehiculos_pais_rollback.sql [--execute]
-- ============================================================================

begin;

drop index if exists idx_vehicles_country_id;
alter table tbl_vehicles drop constraint if exists fk_vehicles_country_id;
alter table tbl_vehicles drop column if exists country_id;

commit;
