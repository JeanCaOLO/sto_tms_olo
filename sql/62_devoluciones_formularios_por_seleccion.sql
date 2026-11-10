-- ============================================================================
-- 62 — Devoluciones: VARIOS formularios por viaje, cada uno con las devoluciones que se marquen.
--
--   tbl_return_form_items   qué devoluciones lleva cada formulario (una devolución en un solo formulario)
--   tbl_return_forms        deja de ser único por viaje (se quita uq_return_form_route; el número DEV-… sigue único)
--   vw_return_trips         ya no une el formulario (duplicaría filas); trae forms_count
--
-- Los formularios que ya existan (de sql/60) quedan asociados a TODAS las devoluciones de su viaje, que es lo que
-- cubrían hasta ahora.
--
-- Aplicar con: node --env-file=.env.local scripts/run-migration.mjs sql/62_devoluciones_formularios_por_seleccion.sql [--execute]
-- Deshacer con: sql/62_devoluciones_formularios_por_seleccion_rollback.sql
-- Idempotente.
-- ============================================================================

begin;

create table if not exists tbl_return_form_items (
  form_id    uuid not null,
  return_id  uuid not null,
  created_at timestamptz not null default now(),
  constraint pk_return_form_item primary key (form_id, return_id),
  constraint fk_return_form_item_form foreign key (form_id) references tbl_return_forms (id) on delete cascade,
  constraint fk_return_form_item_return foreign key (return_id) references tbl_returns (id) on delete cascade,
  -- una devolución va en un solo formulario
  constraint uq_return_form_item_return unique (return_id)
);
create index if not exists idx_return_form_item_form on tbl_return_form_items (form_id);

-- Formularios existentes: llevan todas las devoluciones de su viaje.
insert into tbl_return_form_items (form_id, return_id)
select f.id, rt.id
  from tbl_return_forms f
  join tbl_dispatch_guides g on g.route_id = f.route_id
  join tbl_returns rt on rt.dispatch_guide_id = g.id
on conflict do nothing;

-- Varios formularios por viaje.
alter table tbl_return_forms drop constraint if exists uq_return_form_route;
create index if not exists idx_return_form_route on tbl_return_forms (route_id);

-- La vista pierde form_id/form_number (con varios formularios duplicaría filas): se recrea.
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
    grant select, insert, update, delete on public.tbl_return_form_items to tms_app;
    grant select on public.vw_return_trips to tms_app;
  else
    raise notice 'tms_app no existe: se omiten los GRANT (correr sql/18 primero)';
  end if;
end $$;

commit;
