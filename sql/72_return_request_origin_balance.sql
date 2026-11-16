-- Preparación local: aplicar únicamente por Intelix/Jean. No modifica SQL 60–70.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
create table if not exists public.tbl_return_request_origins (
  request_id uuid primary key references public.tbl_return_requests(id) on delete restrict,
  order_id uuid not null references public.tbl_orders(id) on delete restrict,
  delivery_point_id uuid not null references public.tbl_delivery_points(id) on delete restrict,
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  created_at timestamptz not null default now()
);
alter table public.tbl_return_request_items add column if not exists order_item_id uuid
  references public.tbl_order_items(id) on delete restrict;
alter table public.tbl_returns add column if not exists order_item_id uuid
  references public.tbl_order_items(id) on delete restrict;
create index if not exists idx_return_request_origin_order_72 on public.tbl_return_request_origins(order_id);
create index if not exists idx_return_order_item_72 on public.tbl_returns(order_item_id);

-- Cada escritor bloquea primero tbl_orders FOR UPDATE y luego lee este saldo.
-- Las solicitudes reservan unidades; una devolución vinculada no las consume otra vez.
-- El historial físico sin línea se descuenta de cada línea compatible: nunca se adivina una presentación.
create or replace function public.return_balance_72(p_org uuid, p_order uuid)
returns table(id uuid, line_number integer, product_code text, product_name text, presentation text,
              quantity bigint, remaining bigint) language sql stable as $$
 select i.id,i.line_number,i.product_code::text,i.product_name::text,i.presentation::text,
        greatest(0, i.quantity-coalesce(i.quantity_cancelled,0))::bigint,
        greatest(0, i.quantity-coalesce(i.quantity_cancelled,0))::bigint
        - coalesce((select sum(ri.quantity) from public.tbl_return_request_items ri
          join public.tbl_return_requests rq on rq.id=ri.request_id
          join public.tbl_return_request_origins ro on ro.request_id=rq.id and ro.order_id=i.order_id
          where ri.order_item_id=i.id and rq.organization_id=p_org and rq.status<>'rechazada'),0)::bigint
        - coalesce((select sum(rt.quantity) from public.tbl_returns rt
          where rt.order_id=i.order_id and rt.organization_id=p_org
          and (rt.order_item_id=i.id or (rt.order_item_id is null and
            (rt.product_code=i.product_code or (nullif(btrim(rt.product_code),'') is null
              and rt.product_name=i.product_name))))
          and not exists (select 1 from public.tbl_return_request_items ri
            join public.tbl_return_requests rq on rq.id=ri.request_id
            join public.tbl_return_request_origins ro on ro.request_id=rq.id
            where ri.id=rt.request_item_id and ro.order_id=i.order_id and rq.status<>'rechazada')
        ),0)::bigint
 from public.tbl_order_items i join public.tbl_orders o on o.id=i.order_id
 where o.id=p_order and o.organization_id=p_org;
$$;
create or replace function public.guard_return_origin_72() returns trigger language plpgsql as $$
begin
  raise exception 'El origen operativo es historial inmutable' using errcode='23514';
end $$;
drop trigger if exists tr_return_origin_72 on public.tbl_return_request_origins;
create trigger tr_return_origin_72 before update or delete on public.tbl_return_request_origins
for each row execute function public.guard_return_origin_72();
do $$ begin
  if exists(select 1 from pg_roles where rolname='tms_app') then
    grant select,insert on public.tbl_return_request_origins to tms_app;
  end if;
end $$;
commit;
