-- 71: resolucion de novedades de recepcion (D10). Requiere SQL70.
-- Preparacion local. No aplicar a una base compartida: la aplica Intelix/Jean.
-- La resolucion es una fila nueva e inmutable; el historial de novedades del 70 no se modifica.
-- Resolver deja la devolucion en 'received' (aceptada) o en su estado anterior a la novedad (restaurada).
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

create table if not exists public.tbl_return_incident_resolutions (
 id uuid primary key,
 organization_id uuid not null references public.tbl_organizations(id) on delete restrict,
 return_id uuid not null references public.tbl_returns(id) on delete restrict,
 incident_id uuid not null references public.tbl_return_incidents(id) on delete restrict,
 request_key uuid not null,
 outcome text not null,
 note text not null,
 resolved_by uuid not null references public.tbl_app_users(id) on delete restrict,
 resolved_at timestamptz not null default now(),
 resulting_status text not null,
 resulting_received_quantity integer,
 resulting_received_condition varchar(50),
 constraint uq_return_incident_resolution_incident unique (incident_id),
 constraint uq_return_incident_resolution_attempt unique (organization_id,return_id,resolved_by,request_key),
 constraint ck_return_incident_resolution_outcome check (outcome in ('accepted','restored')),
 constraint ck_return_incident_resolution_note check (length(btrim(note,E' \t\n\r')) between 1 and 1000 and length(note)<=1000),
 constraint ck_return_incident_resolution_status check (resulting_status in ('pending','approved','received','completed')),
 constraint ck_return_incident_resolution_accept check (outcome <> 'accepted' or resulting_status in ('received','completed'))
);
create index if not exists idx_return_incident_resolution_return
 on public.tbl_return_incident_resolutions(return_id, resolved_at desc, id desc);

-- NULL conserva filas de una preparación anterior; solo las nuevas resoluciones reciben la transacción real.
alter table public.tbl_return_incident_resolutions add column if not exists resolved_in_transaction bigint;

-- La resolucion solo cierra la ultima novedad de una devolucion que sigue en revision.
create or replace function public.guard_return_incident_resolution_71()
returns trigger language plpgsql as $$
declare current_status text; current_org uuid; latest uuid; incident_org uuid; incident_return uuid;
begin
 if TG_OP <> 'INSERT' then
  raise exception 'El historial de resoluciones es inmutable' using errcode='23514';
 end if;
 select coalesce(r.status,'pending'),r.organization_id into current_status,current_org
  from public.tbl_returns r where r.id=NEW.return_id for update;
 if current_org is distinct from NEW.organization_id then
  raise exception 'La resolucion no corresponde a la organizacion de la devolucion' using errcode='23514';
 end if;
 if current_status <> 'in_review' then
  raise exception 'Solo una devolucion en revision puede resolverse' using errcode='23514';
 end if;
 select i.organization_id,i.return_id into incident_org,incident_return
  from public.tbl_return_incidents i where i.id=NEW.incident_id;
 if incident_org is distinct from NEW.organization_id or incident_return is distinct from NEW.return_id then
  raise exception 'La novedad no pertenece a la devolucion' using errcode='23514';
 end if;
 select i.id into latest from public.tbl_return_incidents i
  where i.return_id=NEW.return_id and i.organization_id=NEW.organization_id
  order by i.reported_at desc,i.id desc limit 1;
 if latest is distinct from NEW.incident_id then
  raise exception 'Solo se resuelve la ultima novedad de la devolucion' using errcode='23514';
 end if;
 if not exists (select 1 from public.tbl_app_users u where u.id=NEW.resolved_by and u.organization_id=NEW.organization_id) then
  raise exception 'Quien resuelve debe pertenecer a la organizacion' using errcode='23514';
 end if;
 NEW.resolved_in_transaction := txid_current();
 return NEW;
end;
$$;
drop trigger if exists tr_return_incident_resolution_71 on public.tbl_return_incident_resolutions;
create trigger tr_return_incident_resolution_71 before insert or update or delete on public.tbl_return_incident_resolutions
 for each row execute function public.guard_return_incident_resolution_71();

-- Al terminar la transaccion, la devolucion resuelta ya no puede seguir en revision.
create or replace function public.check_return_incident_resolution_71()
returns trigger language plpgsql as $$
begin
 if not exists (select 1 from public.tbl_returns r
    where r.id=NEW.return_id and r.organization_id=NEW.organization_id
      and row(r.status,r.received_quantity,r.received_condition)
        is not distinct from row(NEW.resulting_status,NEW.resulting_received_quantity,NEW.resulting_received_condition)) then
  raise exception 'Una resolucion debe dejar la devolucion con el estado, cantidad y condicion registrados' using errcode='23514';
 end if;
 return NEW;
end;
$$;
drop trigger if exists tr_return_incident_resolution_check_71 on public.tbl_return_incident_resolutions;
create constraint trigger tr_return_incident_resolution_check_71 after insert on public.tbl_return_incident_resolutions
 deferrable initially deferred for each row execute function public.check_return_incident_resolution_71();

-- Una devolucion solo sale de 'in_review' con una resolucion de su ultima novedad en la misma transaccion.
create or replace function public.guard_return_leaves_review_71()
returns trigger language plpgsql as $$
begin
 if OLD.status = 'in_review' and NEW.status is distinct from 'in_review' then
  if not exists (
   select 1 from public.tbl_return_incident_resolutions x
   where x.return_id=OLD.id and x.organization_id=OLD.organization_id and x.resulting_status=NEW.status
     and x.resolved_in_transaction=txid_current()
     and row(NEW.received_quantity,NEW.received_condition)
       is not distinct from row(x.resulting_received_quantity,x.resulting_received_condition)
     and x.incident_id = (select i.id from public.tbl_return_incidents i
          where i.return_id=OLD.id and i.organization_id=OLD.organization_id
          order by i.reported_at desc,i.id desc limit 1)
  ) then
   raise exception 'Una devolucion en revision solo sale resolviendo su novedad' using errcode='23514';
  end if;
 end if;
 return NEW;
end;
$$;
drop trigger if exists tr_return_leaves_review_71 on public.tbl_returns;
create trigger tr_return_leaves_review_71 before update of status on public.tbl_returns
 for each row execute function public.guard_return_leaves_review_71();

do $$
begin
 if exists (select 1 from pg_roles where rolname='tms_app') then
  grant select,insert on public.tbl_return_incident_resolutions to tms_app;
 end if;
end;
$$;
commit;
