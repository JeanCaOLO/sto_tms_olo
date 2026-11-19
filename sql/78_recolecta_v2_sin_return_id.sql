-- ============================================================================
-- 78 — Parada de recolecta del contrato v2 sin return_id (2026-11-18).
--
-- sql/60 exigía collection <=> return_id NOT NULL (recolecta = devolución física de
-- tbl_returns). El contrato v2 de Devoluciones (sql/77) crea la parada `collection` con
-- return_id NULL y la amarra por tbl_return_collection_allocations.plan_stop_id; la
-- devolución física nace recién al entregar. Se relaja a: return_id solo en paradas
-- collection. Las históricas siguen igual.
--
-- Aplicar con: node --env-file=.env.local scripts/run-migration.mjs sql/78_recolecta_v2_sin_return_id.sql [--execute]
-- Deshacer con: sql/78_recolecta_v2_sin_return_id_rollback.sql
-- Idempotente.
-- ============================================================================

begin;

alter table tbl_plan_stops drop constraint if exists ck_plan_stops_collection_return;
alter table tbl_plan_stops add constraint ck_plan_stops_collection_return
  check (return_id is null or stop_type = 'collection');
comment on constraint ck_plan_stops_collection_return on tbl_plan_stops is
  'return_id solo en recolectas; una recolecta v2 (sql/77) va sin return_id.';

commit;

-- Validación (debe dar true)
select pg_get_constraintdef(oid) = 'CHECK (((return_id IS NULL) OR (stop_type = ''collection''::text)))' as check_ok
from pg_constraint where conname = 'ck_plan_stops_collection_return';
