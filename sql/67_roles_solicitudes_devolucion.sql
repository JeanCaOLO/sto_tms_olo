begin;
-- Solo Jean puede aplicar esta migracion. Ver docs/devoluciones/ENTREGA_JEAN_SQL67.md.
-- Expansion compatible: no convierte solicitudes existentes ni registra recepcion fisica.
set local lock_timeout = '5s';
set local statement_timeout = '60s';

alter table public.tbl_return_requests
  add column if not exists decided_by uuid references public.tbl_app_users(id) on delete restrict,
  add column if not exists decided_at timestamptz,
  add column if not exists rejection_reason text;
alter table public.tbl_return_requests drop constraint if exists ck_return_request_status;
alter table public.tbl_return_requests add constraint ck_return_request_status
  check (status in ('pendiente_asignacion', 'aprobada', 'rechazada'));
alter table public.tbl_return_requests drop constraint if exists ck_return_request_decision;
alter table public.tbl_return_requests add constraint ck_return_request_decision check (
  (status = 'pendiente_asignacion' and decided_by is null and decided_at is null and rejection_reason is null)
  or (status = 'aprobada' and decided_by is not null and decided_at is not null and rejection_reason is null)
  or (status = 'rechazada' and decided_by is not null and decided_at is not null
      and rejection_reason is not null and length(btrim(rejection_reason)) between 1 and 500
      and length(rejection_reason) <= 500)
);

-- El destino y el autor son la identidad historica, no una asignacion que se recalcula.
-- La autorizacion por rol, paises y tbl_user_scopes corresponde al backend (T04).
create or replace function public.guard_return_request_decision_67()
returns trigger language plpgsql as $$
begin
  if TG_OP = 'UPDATE' then
    if row(NEW.id, NEW.organization_id, NEW.customer_id, NEW.requested_by, NEW.request_number)
       is distinct from row(OLD.id, OLD.organization_id, OLD.customer_id, OLD.requested_by, OLD.request_number) then
      raise exception 'La identidad y el destino historico de la solicitud son inmutables' using errcode = '23514';
    end if;
    if OLD.status in ('aprobada', 'rechazada') and
       row(NEW.status, NEW.decided_by, NEW.decided_at, NEW.rejection_reason)
       is distinct from row(OLD.status, OLD.decided_by, OLD.decided_at, OLD.rejection_reason) then
      raise exception 'La decision comercial ya fue registrada' using errcode = '23514';
    end if;
  else
    if not exists (
      select 1 from public.tbl_customers c join public.tbl_app_users u
        on u.id = NEW.requested_by and u.organization_id = c.organization_id
      where c.id = NEW.customer_id and c.organization_id = NEW.organization_id
        and u.customer_id = c.id
    ) then
      raise exception 'Empresa o solicitante incompatibles con la organizacion/asignacion' using errcode = '23514';
    end if;
  end if;
  if NEW.decided_by is not null and not exists (
    select 1 from public.tbl_app_users u
    where u.id = NEW.decided_by and u.organization_id = NEW.organization_id
  ) then
    raise exception 'El decisor debe pertenecer a la organizacion de la solicitud' using errcode = '23514';
  end if;
  return NEW;
end;
$$;
drop trigger if exists tr_return_request_decision_67 on public.tbl_return_requests;
create trigger tr_return_request_decision_67 before insert or update on public.tbl_return_requests
for each row execute function public.guard_return_request_decision_67();

-- NULL preserva contracamion y filas anteriores. La guia distingue ejecuciones en viajes distintos.
alter table public.tbl_returns add column if not exists request_item_id uuid
  references public.tbl_return_request_items(id) on delete restrict;
create unique index if not exists uq_returns_request_item_guide_67
  on public.tbl_returns(request_item_id, dispatch_guide_id) where request_item_id is not null;

create or replace function public.guard_return_request_link_67()
returns trigger language plpgsql as $$
begin
  if TG_OP = 'UPDATE' and OLD.request_item_id is not null and
    row(NEW.request_item_id, NEW.organization_id, NEW.order_id, NEW.dispatch_guide_id, NEW.return_type)
    is distinct from row(OLD.request_item_id, OLD.organization_id, OLD.order_id, OLD.dispatch_guide_id, OLD.return_type) then
    raise exception 'La identidad operativa vinculada no puede reasignarse ni eliminarse' using errcode = '23514';
  end if;
  if NEW.request_item_id is not null and not exists (
    select 1 from public.tbl_return_request_items i
    join public.tbl_return_requests q on q.id = i.request_id
    join public.tbl_orders o on o.id = NEW.order_id and o.customer_id = q.customer_id
      and o.organization_id = q.organization_id
    join public.tbl_customers c on c.id = o.customer_id and c.organization_id = q.organization_id
    join public.tbl_dispatch_guides g on g.id = NEW.dispatch_guide_id and g.order_id = o.id
      and g.organization_id = q.organization_id
    join public.tbl_routes r on r.id = g.route_id and r.organization_id = q.organization_id
    where i.id = NEW.request_item_id and q.organization_id = NEW.organization_id
      and q.status = 'aprobada' and NEW.return_type = 'recolecta'
  ) then
    raise exception 'Recolecta sin solicitud aprobada o con relacion operativa incoherente' using errcode = '23514';
  end if;
  return NEW;
end;
$$;
drop trigger if exists tr_return_request_link_67 on public.tbl_returns;
create trigger tr_return_request_link_67 before insert or update on public.tbl_returns
for each row execute function public.guard_return_request_link_67();
commit;
