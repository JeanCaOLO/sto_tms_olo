-- ============================================================================
-- 65 — Fix: vw_return_trips alinea pending_returns con returns_gate.py
--
-- Antes: pending_returns contaba `status not in ('received', 'rejected', 'cancelled')`,
-- lo cual incluía erróneamente 'completed'.
-- Ahora: pending_returns cuenta `status in ('pending', 'approved')`, idéntico a
-- returns_gate.py y src/lib/devoluciones/trips.ts (OPEN_STATUSES).
-- Además, received_returns cuenta 'received' y 'completed'.
--
-- Aplicar con: node --env-file=.env.local scripts/run-migration.mjs sql/65_fix_pending_returns_count.sql [--execute]
-- Deshacer con: sql/65_fix_pending_returns_count_rollback.sql
-- Idempotente.
-- ============================================================================

begin;

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
  if exists (select 1 from pg_roles where rolname = 'tms_app') then
    grant select on public.vw_return_trips to tms_app;
  end if;
end $$;

commit;
