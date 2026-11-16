begin;
set local lock_timeout = '5s';
do $$ begin
  if to_regclass('public.tbl_return_request_origins') is not null then
    if exists(select 1 from public.tbl_return_request_origins) then
      raise exception 'SQL72 utilizado: no se puede eliminar el historial de origen';
    end if;
  end if;
  if exists(select 1 from information_schema.columns where table_schema='public'
    and table_name='tbl_returns' and column_name='order_item_id') then
    if exists(select 1 from public.tbl_returns where order_item_id is not null) then
      raise exception 'SQL72 utilizado: hay devoluciones con línea de pedido';
    end if;
  end if;
  if exists(select 1 from information_schema.columns where table_schema='public'
    and table_name='tbl_return_request_items' and column_name='order_item_id') then
    if exists(select 1 from public.tbl_return_request_items where order_item_id is not null) then
      raise exception 'SQL72 utilizado: hay artículos con línea de pedido';
    end if;
  end if;
end $$;
drop function if exists public.return_balance_72(uuid,uuid);
drop table if exists public.tbl_return_request_origins;
drop function if exists public.guard_return_origin_72();
alter table public.tbl_return_request_items drop column if exists order_item_id;
alter table public.tbl_returns drop column if exists order_item_id;
commit;
