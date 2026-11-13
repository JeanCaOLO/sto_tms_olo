-- 70: novedades de recepcion con texto e historial; no implementa aceptacion interna.
-- Preparacion local. No aplicar a una base compartida desde esta auditoria.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
alter table public.tbl_returns drop constraint if exists ck_return_status;
alter table public.tbl_returns add constraint ck_return_status
 check (status in ('pending','approved','received','completed','rejected','cancelled','in_review'));
create table if not exists public.tbl_return_incidents (
 id uuid primary key,
 organization_id uuid not null references public.tbl_organizations(id) on delete restrict,
 return_id uuid not null references public.tbl_returns(id) on delete restrict,
 request_key uuid not null,
 explanation text not null,
 reported_by uuid not null references public.tbl_app_users(id) on delete restrict,
 reported_at timestamptz not null default now(),
 previous_status text not null,
 previous_received_quantity integer,
 previous_received_condition varchar(50),
 constraint uq_return_incident_attempt unique (organization_id,return_id,reported_by,request_key),
 constraint ck_return_incident_explanation check (length(btrim(explanation,E' \t\n\r')) between 1 and 1000 and length(explanation)<=1000),
 constraint ck_return_incident_previous_status check (previous_status in ('pending','approved','received','completed'))
);
create index if not exists idx_return_incident_history on public.tbl_return_incidents(return_id,reported_at desc,id desc);
create or replace function public.guard_return_incident_history_70()
returns trigger language plpgsql as $$
declare original_status text; original_org uuid;
begin
 if TG_OP <> 'INSERT' then
  raise exception 'El historial de novedades es inmutable' using errcode='23514';
 end if;
 select coalesce(r.status,'pending'),r.organization_id into original_status,original_org
  from public.tbl_returns r where r.id=NEW.return_id for update;
 if original_org is distinct from NEW.organization_id or original_status is distinct from NEW.previous_status
    or original_status not in ('pending','approved','received','completed') then
  raise exception 'La novedad no corresponde al estado u organizacion de la devolucion' using errcode='23514';
 end if;
 if not exists (select 1 from public.tbl_app_users u where u.id=NEW.reported_by and u.organization_id=NEW.organization_id) then
  raise exception 'El autor de la novedad debe pertenecer a su organizacion' using errcode='23514';
 end if;
 return NEW;
end;
$$;
drop trigger if exists tr_return_incident_history_70 on public.tbl_return_incidents;
create trigger tr_return_incident_history_70 before insert or update or delete on public.tbl_return_incidents
 for each row execute function public.guard_return_incident_history_70();

-- El endpoint inserta el historial y cambia el estado en la misma transaccion.
-- Una escritura directa tampoco puede confirmar una novedad sin activar el bloqueo.
create or replace function public.check_return_incident_review_70()
returns trigger language plpgsql as $$
begin
 if not exists (select 1 from public.tbl_returns r
    where r.id=NEW.return_id and r.organization_id=NEW.organization_id and r.status='in_review') then
  raise exception 'Una novedad debe dejar su devolucion en revision' using errcode='23514';
 end if;
 return NEW;
end;
$$;
drop trigger if exists tr_return_incident_review_70 on public.tbl_return_incidents;
create constraint trigger tr_return_incident_review_70 after insert on public.tbl_return_incidents
 deferrable initially deferred for each row execute function public.check_return_incident_review_70();

create or replace view vw_return_trips as
select r.id                                   as route_id,
       r.organization_id,
       r.route_number,
       r.route_date,
       r.plan_trip_id,
       r.status                               as route_status,
       r.driver_id,
       d.full_name                            as driver_name,
       r.carrier_id,
       c.name                                 as carrier_name,
       s.country_id,
       count(rt.id)::int                      as total_returns,
       (count(rt.id) filter (where coalesce(rt.status, 'pending') in ('received', 'completed')))::int as received_returns,
       (count(rt.id) filter (where coalesce(rt.status, 'pending') in ('pending', 'approved', 'in_review')))::int as pending_returns,
       max(rt.return_date)                    as last_return_at,
       (select count(*)::int from tbl_return_forms f where f.route_id = r.id) as forms_count,
       (count(rt.id) filter (where coalesce(rt.status, 'pending') in ('pending','approved')))::int as open_returns,
       (count(rt.id) filter (where rt.status = 'in_review'))::int as incident_returns
  from tbl_routes r
  join tbl_stores s on s.id = r.store_id
  join tbl_dispatch_guides g on g.route_id = r.id
  join tbl_returns rt on rt.dispatch_guide_id = g.id
  left join tbl_drivers d on d.id = r.driver_id
  left join tbl_carriers c on c.id = r.carrier_id
 group by r.id, r.organization_id, r.route_number, r.route_date, r.plan_trip_id, r.status, r.driver_id,
          d.full_name, r.carrier_id, c.name, s.country_id;

do $$
begin
 if exists (select 1 from pg_roles where rolname='tms_app') then
  grant select,insert on public.tbl_return_incidents to tms_app;
  grant select on public.vw_return_trips to tms_app;
 end if;
end;
$$;
commit;
