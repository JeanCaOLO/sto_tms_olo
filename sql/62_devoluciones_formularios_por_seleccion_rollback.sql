-- ============================================================================
-- 62 ROLLBACK — vuelve a UN formulario por viaje. Idempotente.
--
-- Si un viaje ya tiene varios formularios, se conserva el más antiguo y los demás se copian antes a
-- tbl_return_forms_62_bak (con sus secciones en tbl_return_form_sections_62_bak) para no perder lo capturado.
-- ============================================================================

begin;

create table if not exists tbl_return_forms_62_bak as
  select f.* from tbl_return_forms f
   where exists (select 1 from tbl_return_forms o where o.route_id = f.route_id and (o.created_at, o.id) < (f.created_at, f.id));
create table if not exists tbl_return_form_sections_62_bak as
  select s.* from tbl_return_form_sections s where s.form_id in (select id from tbl_return_forms_62_bak);

delete from tbl_return_forms f
 where f.id in (select id from tbl_return_forms_62_bak);

drop view if exists vw_return_trips;
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
       (count(rt.id) filter (where rt.status = 'received'))::int as received_returns,
       (count(rt.id) filter (where coalesce(rt.status, 'pending') not in ('received', 'rejected', 'cancelled')))::int as pending_returns,
       max(rt.return_date)                    as last_return_at,
       f.id                                   as form_id,
       f.form_number
  from tbl_routes r
  join tbl_stores s on s.id = r.store_id
  join tbl_dispatch_guides g on g.route_id = r.id
  join tbl_returns rt on rt.dispatch_guide_id = g.id
  left join tbl_drivers d on d.id = r.driver_id
  left join tbl_carriers c on c.id = r.carrier_id
  left join tbl_return_forms f on f.route_id = r.id
 group by r.id, r.organization_id, r.route_number, r.route_date, r.plan_trip_id, r.status, r.driver_id,
          d.full_name, r.carrier_id, c.name, s.country_id, f.id, f.form_number;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'tms_app') then
    grant select on public.vw_return_trips to tms_app;
  end if;
end $$;

drop index if exists idx_return_form_route;
alter table tbl_return_forms drop constraint if exists uq_return_form_route;
alter table tbl_return_forms add constraint uq_return_form_route unique (route_id);

drop table if exists tbl_return_form_items;

commit;
