-- ============================================================================
-- 64 — Días de anticipo y tipo de zona en tbl_zones (handoff con Planificación, 2026-11-09).
--
-- Planificación ya calcula la zona TMS del pedido en tbl_orders.tms_zone_id (FK a
-- tbl_zones.id, por geocerca y país). El OMS pasa a tomar los DÍAS DE ANTICIPO de la
-- ventana de liberación desde la ZONA del pedido, en vez del valor fijo por scope
-- (oms_rule_configs.dias_prep_picking). Estas dos columnas son del OMS:
--
--   tbl_zones.dias_anticipo  días de anticipo con que se libera un pedido de esa zona
--                            (reemplaza como FUENTE a dias_prep_picking). Default 1 =
--                            comportamiento actual de CR. Si el pedido no hace match de
--                            zona (tms_zone_id NULL / fuera de geocerca), el OMS cae al
--                            default por scope dias_prep_picking (lógica en el backend,
--                            no en esta columna).
--   tbl_zones.tipo_zona      'corta' | 'larga'. Lo pide Planificación; el OMS no lo usa.
--
-- Zonas POR PAÍS, sin compañía (tbl_zones ya es country-level: tiene country_id, no
-- company_id) — como se acordó en la reunión del 2026-11-07.
--
-- Nota: la vista de compatibilidad public.zones (sql/59) es `select *` y NO expone
-- columnas nuevas hasta recrearse; no se toca aquí porque el OMS lee tbl_zones directo.
--
-- Aplicar con: node --env-file=.env.local scripts/run-migration.mjs sql/64_zonas_dias_anticipo.sql [--execute]
-- Deshacer con: sql/64_zonas_dias_anticipo_rollback.sql
-- Idempotente.
-- ============================================================================

begin;

alter table tbl_zones add column if not exists dias_anticipo smallint not null default 1;
alter table tbl_zones drop constraint if exists ck_zones_dias_anticipo;
alter table tbl_zones
  add constraint ck_zones_dias_anticipo
  check (dias_anticipo >= 0);

alter table tbl_zones add column if not exists tipo_zona text;
alter table tbl_zones drop constraint if exists ck_zones_tipo_zona;
alter table tbl_zones
  add constraint ck_zones_tipo_zona
  check (tipo_zona is null or tipo_zona in ('corta', 'larga'));

comment on column tbl_zones.dias_anticipo is
  'Dias de anticipo de la ventana de liberacion del OMS para los pedidos de esta zona. Default 1. Fuente que reemplaza a oms_rule_configs.dias_prep_picking (handoff 2026-11-09).';
comment on column tbl_zones.tipo_zona is
  'Clasificacion de la zona: corta | larga. La usa Planificacion; el OMS no la lee.';

commit;
