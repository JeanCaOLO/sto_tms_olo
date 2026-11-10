-- ============================================================================
-- 64 ROLLBACK — Retira dias_anticipo y tipo_zona de tbl_zones (revierte sql/64).
--
-- Quita primero los CHECK y luego las columnas. Idempotente (if exists).
-- Aplicar con: node --env-file=.env.local scripts/run-migration.mjs sql/64_zonas_dias_anticipo_rollback.sql [--execute]
-- ============================================================================

begin;

alter table tbl_zones drop constraint if exists ck_zones_dias_anticipo;
alter table tbl_zones drop constraint if exists ck_zones_tipo_zona;
alter table tbl_zones drop column if exists dias_anticipo;
alter table tbl_zones drop column if exists tipo_zona;

commit;
