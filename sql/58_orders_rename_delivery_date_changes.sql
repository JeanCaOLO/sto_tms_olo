-- ============================================================================
-- 58 — Reconciliar el nombre del contador de cambios de fecha de entrega:
--      orders.delivery_date_change_count  ->  delivery_date_changes
--
-- POR QUÉ: Planificación es dueña del cambio de fecha de entrega (bandeja.py /
-- cambio_fecha.py) y usa el nombre `delivery_date_changes` (su migración original
-- `sql/57_orders_cambio_fecha_entrega.sql`). El refactor a `tbl_orders` dejó el
-- contador con el nombre de `sql/56` (`delivery_date_change_count`), lo que ROMPÍA
-- la bandeja (SELECT a una columna inexistente). Se unifica en el nombre de
-- Planificación para dejar su código intacto; el panel del OMS se adapta a leer
-- `delivery_date_changes`. SUPERSEDE el nombre de `sql/56`.
--
-- La tabla real es `public.tbl_orders`; `public.orders` es una VISTA que lista las
-- columnas EXPLÍCITAMENTE (congela los nombres), así que hay que RECREARLA para que
-- exponga `delivery_date_changes`. La vista es una proyección simple 1:1 de las 57
-- columnas de tbl_orders (auto-actualizable: el DML del app sigue por ella).
--
-- Estándar OLTP INTELIX. Aurora PostgreSQL. Idempotente. Transaccional.
--
-- Uso:  node --env-file=.env.local scripts/run-migration.mjs sql/58_...sql            (dry-run)
--       node --env-file=.env.local scripts/run-migration.mjs sql/58_...sql --execute
-- ============================================================================

begin;

-- 1) La vista depende de la columna y congela su nombre -> se recrea al final.
drop view if exists public.orders;

-- 2) Renombrar la columna base (idempotente) y su CHECK.
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_name = 'tbl_orders' and column_name = 'delivery_date_change_count')
     and not exists (select 1 from information_schema.columns
             where table_name = 'tbl_orders' and column_name = 'delivery_date_changes') then
    alter table tbl_orders rename column delivery_date_change_count to delivery_date_changes;
  end if;
end $$;

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'ck_order_delivery_date_change_count') then
    alter table tbl_orders rename constraint ck_order_delivery_date_change_count to ck_order_delivery_date_changes;
  end if;
end $$;

-- 3) Recrear la vista idéntica (mismas 57 columnas, mismo orden) con el nombre nuevo.
create view public.orders as
 select id,
        organization_id,
        customer_id,
        order_number,
        invoice_number,
        order_date,
        delivery_date,
        total_weight,
        total_volume,
        total_items,
        total_amount,
        delivery_address,
        delivery_city,
        delivery_latitude,
        delivery_longitude,
        delivery_zone,
        priority,
        status,
        notes,
        created_at,
        updated_at,
        route_type_id,
        delivery_point_id,
        warehouse_id,
        branch_id,
        final_customer_id,
        destination_warehouse_id,
        eflow_id_almacen,
        eflow_id_compania,
        eflow_id_sucursal,
        eflow_id_expedicion,
        eflow_id_cliente,
        order_type,
        wms_status,
        wms_situation,
        drop_code,
        emergency,
        erp_document,
        generated_at,
        closed_at,
        planned_dispatch_at,
        wms_created_at,
        wms_modified_at,
        oms_score,
        handoff_status,
        prioritization_run_id,
        numero_viaje,
        lead_time_days,
        planning_run_id,
        oms_processed_at,
        observaciones,
        es_cliente_retira,
        dispatch_date,
        delivery_date_eflow,
        delivery_date_changed_at,
        delivery_date_changed_by,
        delivery_date_changes
   from tbl_orders;

-- 4) Restituir owner y permisos (DROP VIEW los perdió).
alter view public.orders owner to olo_db;
grant select, insert, update, delete on public.orders to tms_app;

-- 5) Validación.
do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_name = 'tbl_orders' and column_name = 'delivery_date_changes') then
    raise exception 'sql/58: falta tbl_orders.delivery_date_changes';
  end if;
  if exists (select 1 from information_schema.columns
             where table_name = 'tbl_orders' and column_name = 'delivery_date_change_count') then
    raise exception 'sql/58: todavía existe delivery_date_change_count';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_name = 'orders' and column_name = 'delivery_date_changes') then
    raise exception 'sql/58: la vista orders no expone delivery_date_changes';
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ck_order_delivery_date_changes') then
    raise exception 'sql/58: falta el CHECK ck_order_delivery_date_changes';
  end if;
  raise notice 'sql/58: OK (delivery_date_change_count -> delivery_date_changes, vista recreada)';
end $$;

commit;

-- ============================================================================
-- ROLLBACK (descomentar): revierte al nombre de sql/56. Hay que recrear la vista igual.
-- ----------------------------------------------------------------------------
-- begin;
-- drop view if exists public.orders;
-- alter table tbl_orders rename column delivery_date_changes to delivery_date_change_count;
-- alter table tbl_orders rename constraint ck_order_delivery_date_changes to ck_order_delivery_date_change_count;
-- create view public.orders as select ... (lista de 57 columnas con delivery_date_change_count) from tbl_orders;
-- alter view public.orders owner to olo_db;
-- grant select, insert, update, delete on public.orders to tms_app;
-- commit;
-- ============================================================================
