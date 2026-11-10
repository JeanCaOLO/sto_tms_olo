-- ============================================================================
-- 64_zona_tms_calculada_pedido_rollback.sql — deshace la sql/64.
-- Los valores demo de route_type_id (706 pedidos del 2026-09-26) no se restauran: no los usa nadie.
-- ============================================================================

drop trigger if exists trg_orders_tms_zone on public.tbl_orders;
drop function if exists public.fn_orders_set_tms_zone();
drop function if exists public.fn_zona_tms(numeric, numeric, uuid);

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'fk_orders_tms_zone') then
    alter table public.tbl_orders rename constraint fk_orders_tms_zone to fk_order_zone;
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'tbl_orders' and column_name = 'tms_zone_id') then
    alter table public.tbl_orders rename column tms_zone_id to route_type_id;
  end if;
end $$;

comment on column public.tbl_orders.route_type_id is null;
