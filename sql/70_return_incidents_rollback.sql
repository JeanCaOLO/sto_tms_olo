-- Rollback solo antes de uso. No borra novedades ni reinterpreta revisiones activas.
begin;
set local lock_timeout='5s';
do $$
begin
 if to_regclass('public.tbl_return_incidents') is not null then
  if exists (select 1 from public.tbl_return_incidents) then
   raise exception 'No se puede eliminar historial de novedades existente';
  end if;
 end if;
 if exists (select 1 from public.tbl_returns where status='in_review') then
  raise exception 'Hay devoluciones en revision; no se puede retirar el bloqueo';
 end if;
end;
$$;
drop table if exists public.tbl_return_incidents;
drop function if exists public.guard_return_incident_history_70();
drop function if exists public.check_return_incident_review_70();
alter table public.tbl_returns drop constraint if exists ck_return_status;
alter table public.tbl_returns add constraint ck_return_status
 check (status in ('pending','approved','received','completed','rejected','cancelled'));
drop view if exists public.vw_return_trips;
create view vw_return_trips as
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
       (count(rt.id) filter (where coalesce(rt.status, 'pending') in ('pending', 'approved')))::int as pending_returns,
       max(rt.return_date)                    as last_return_at,
       (select count(*)::int from tbl_return_forms f where f.route_id = r.id) as forms_count
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
  grant select on public.vw_return_trips to tms_app;
 end if;
end;
$$;
commit;
