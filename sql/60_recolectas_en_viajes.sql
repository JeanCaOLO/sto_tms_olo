-- ============================================================================
-- 60_recolectas_en_viajes.sql — el planificador agenda las devoluciones (recolectas)
-- como paradas de un viaje que ya pasa por ese cliente o esa zona.
--
-- Reunión 2026-11-05: servicio al cliente crea la devolución → cae en la Bandeja →
-- Planificación le pone fecha y la mete en un viaje. La parada usa el mismo tipo
-- que tracking ya maneja en dispatch_guides ('delivery' | 'collection').
--
-- Estándar OLTP INTELIX (sql/README.md): nombres físicos tbl_*, prefijos, ROLLBACK + validación.
-- Aurora PostgreSQL. Idempotente.
--
-- Uso:  node --env-file=.env.local scripts/run-migration.mjs sql/60_recolectas_en_viajes.sql            (ensayo)
--       node --env-file=.env.local scripts/run-migration.mjs sql/60_recolectas_en_viajes.sql --execute  (aplica)
-- ============================================================================

-- Fecha en que se va a recoger (la pone el planificador). NULL = todavía sin agendar.
alter table tbl_returns add column if not exists pickup_date date;
create index if not exists idx_returns_pickup_date on tbl_returns (pickup_date);
comment on column tbl_returns.pickup_date is 'Fecha de recolección agendada por Planificación (NULL = sin agendar).';

-- Tipo de parada y devolución que se recoge. order_id sigue siendo el pedido original
-- (dirección, cliente, coordenadas), así que una recolecta no toca ese pedido.
alter table tbl_plan_stops add column if not exists stop_type text not null default 'delivery';
alter table tbl_plan_stops drop constraint if exists ck_plan_stops_stop_type;
alter table tbl_plan_stops add constraint ck_plan_stops_stop_type check (stop_type in ('delivery', 'collection'));
alter table tbl_plan_stops add column if not exists return_id uuid;
alter table tbl_plan_stops drop constraint if exists fk_plan_stops_return_id;
alter table tbl_plan_stops add constraint fk_plan_stops_return_id foreign key (return_id) references tbl_returns (id) on delete cascade;
alter table tbl_plan_stops drop constraint if exists ck_plan_stops_collection_return;
alter table tbl_plan_stops add constraint ck_plan_stops_collection_return check ((stop_type = 'collection') = (return_id is not null));
create index if not exists idx_plan_stops_return_id on tbl_plan_stops (return_id);
comment on column tbl_plan_stops.stop_type is 'delivery = entrega del pedido; collection = recolecta de la devolución return_id.';

-- Las vistas de compatibilidad tienen que ver las columnas nuevas (sql/README.md).
create or replace view public.returns as select * from public.tbl_returns;
create or replace view public.plan_stops as select * from public.tbl_plan_stops;

-- ============================================================================
-- ROLLBACK (descomentar y ejecutar en orden)
-- ----------------------------------------------------------------------------
-- delete from tbl_plan_stops where stop_type = 'collection';
-- drop view if exists public.plan_stops;  -- + recrearla sin las columnas, con sus GRANT y comentario compat:estandar-oltp-59
-- drop view if exists public.returns;     -- ídem
-- drop index if exists idx_plan_stops_return_id;
-- alter table tbl_plan_stops drop constraint if exists ck_plan_stops_collection_return;
-- alter table tbl_plan_stops drop constraint if exists fk_plan_stops_return_id;
-- alter table tbl_plan_stops drop constraint if exists ck_plan_stops_stop_type;
-- alter table tbl_plan_stops drop column if exists return_id;
-- alter table tbl_plan_stops drop column if exists stop_type;
-- drop index if exists idx_returns_pickup_date;
-- alter table tbl_returns drop column if exists pickup_date;
-- ============================================================================

-- Validación (todo debe dar true)
select exists (select 1 from information_schema.columns where table_name = 'tbl_returns' and column_name = 'pickup_date')    as pickup_date_ok,
       exists (select 1 from information_schema.columns where table_name = 'tbl_plan_stops' and column_name = 'stop_type')   as stop_type_ok,
       exists (select 1 from information_schema.columns where table_name = 'tbl_plan_stops' and column_name = 'return_id')   as return_id_ok,
       exists (select 1 from pg_constraint where conname = 'ck_plan_stops_collection_return')                                 as check_ok,
       exists (select 1 from information_schema.columns where table_name = 'plan_stops' and column_name = 'return_id')       as vista_ok;
