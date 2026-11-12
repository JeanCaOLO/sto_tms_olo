-- ============================================================================
-- 45 — Maestros EFLOW, paso 5: quitar orders.store_id.
--
-- Plan: docs/work/2026-10/2026-10-16-plan-modelo-pedidos-clientes-eflow.md (paso 5).
-- El destino del pedido es final_customer_id (tienda o mayoreo, sql/43); el
-- origen de las RUTAS sigue en routes.store_id (no se toca: lo usan Liquidaciones
-- y Tarifas). La tabla stores se mantiene como catálogo de orígenes.
--
-- ⚠️ NO APLICAR hasta que se cumplan las dos condiciones:
--   1. La pantalla de Pedidos sin el embed `store:stores(...)` (rama oms,
--      src/pages/pedidos/) está integrada en main. Hoy main todavía lee
--      orders.store_id: aplicar antes rompe Pedidos para quien trabaje desde main.
--   2. Los scripts de otros equipos que insertan orders.store_id ya no lo mandan
--      (agregar_pedidos_reales.py, agregar_viajes_para_recalcular.js,
--      scripts/generar-viajes-automatico.mjs, scripts/seed-guias-despacho-demo.mjs).
-- En el mismo cambio, quitar la relación orders.store_id -> stores de
-- server/tms-relations.mjs, backend/data/src/relations.py y
-- backend-planif/src/domain/data/relations.py.
--
-- Uso:  node --env-file=.env scripts/run-migration.mjs sql/45_...sql            (dry-run)
--       node --env-file=.env scripts/run-migration.mjs sql/45_...sql --execute
-- ============================================================================

begin;

alter table orders drop constraint if exists fk_order_store;
drop index if exists idx_order_store;
alter table orders drop column if exists store_id;

-- ROLLBACK (la columna vuelve VACÍA; los valores solo se recuperan desde un
-- snapshot de Aurora, que guarda 7 días, o desde audit.events):
-- alter table orders add column store_id uuid;
-- alter table orders add constraint fk_order_store foreign key (store_id) references stores (id) on delete cascade;
-- create index idx_order_store on orders (store_id);

do $$
begin
  if exists (select 1 from information_schema.columns where table_name = 'orders' and column_name = 'store_id') then
    raise exception 'Validación sql/45: FALTA quitar orders.store_id';
  end if;
  if to_regclass('public.tarifas_v_viaje_pedidos') is null or to_regclass('public.tarifas_v_viaje_cargas') is null then
    raise exception 'Validación sql/45: FALTA una vista de tarifas';
  end if;
  raise notice 'Validación sql/45: OK';
end $$;

commit;
