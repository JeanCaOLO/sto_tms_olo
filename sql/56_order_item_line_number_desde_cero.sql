-- ============================================================================
-- 56 — order_items.line_number acepta 0: EFLOW numera IDEXPEDICIONLINEA desde 0.
--
-- sql/44 mapeó line_number = IDEXPEDICIONLINEA (llave natural de EFLOW, mismo
-- formato) pero puso ck_order_item_line_number (line_number >= 1) suponiendo que
-- las líneas arrancaban en 1. Las líneas reales arrancan en 0 (verificado en
-- EFLOW_OLO.EXPEDICIONESDETALLE, p. ej. PL0000004452-O), y la ingesta de
-- artículos (backend/planning/src/ingest_items.py) las rechazaba.
--
-- Uso:  node --env-file=.env.local scripts/run-migration.mjs sql/56_...sql            (dry-run)
--       node --env-file=.env.local scripts/run-migration.mjs sql/56_...sql --execute
-- ============================================================================

begin;

alter table order_items drop constraint if exists ck_order_item_line_number;
alter table order_items add constraint ck_order_item_line_number check (line_number >= 0);
comment on column order_items.line_number is 'EFLOW IDEXPEDICIONLINEA (empieza en 0). Único por pedido.';

-- ROLLBACK (solo si no hay líneas con line_number = 0):
-- alter table order_items drop constraint if exists ck_order_item_line_number;
-- alter table order_items add constraint ck_order_item_line_number check (line_number >= 1);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ck_order_item_line_number'
                 and pg_get_constraintdef(oid) like '%>= 0%') then
    raise exception 'Validación sql/56: ck_order_item_line_number no quedó en >= 0';
  end if;
  raise notice 'Validación sql/56: OK';
end $$;

commit;
