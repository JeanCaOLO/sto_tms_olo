-- ============================================================================
-- 78 ROLLBACK — Vuelve a exigir return_id en toda recolecta (sql/60).
-- Falla si existen recolectas v2 (collection sin return_id): cancelarlas antes
-- (cancel_return_collection_v2) o no revertir.
-- Aplicar con: node --env-file=.env.local scripts/run-migration.mjs sql/78_recolecta_v2_sin_return_id_rollback.sql [--execute]
-- ============================================================================

begin;

alter table tbl_plan_stops drop constraint if exists ck_plan_stops_collection_return;
alter table tbl_plan_stops add constraint ck_plan_stops_collection_return
  check ((stop_type = 'collection') = (return_id is not null));

commit;
