-- ============================================================================
-- 24 — Pedidos de cada viaje: auditar viajes incompletos y liquidar por pedido.
--
-- Contexto (2026-10-05): un viaje trae varias guías de despacho y cada guía lleva un pedido. Para
-- auditar lo que falta entregar, y para anular un pedido o dejarlo para liquidar después, el
-- liquidador necesita ver los pedidos uno por uno, no solo agrupados por casa comercial.
--
--   * `tarifas_trip_order_marks`: la decisión sobre un pedido de un viaje (ANULADO / DIFERIDO).
--   * Vista `tarifas_v_viaje_pedidos`: una fila por guía, con su pedido, casa comercial, valor,
--     estado de entrega y la marca vigente. Reemplaza en el cálculo a `tarifas_v_viaje_cargas`
--     (que se conserva, sin uso, para no romper lecturas viejas).
--   * `tarifas_v_viajes.delivered_guides`: guías ya entregadas, para medir el avance del viaje.
--   * `tarifas_settlements.orders`: foto de los pedidos al emitir y qué se hizo con cada uno.
--
-- Las devoluciones siguen siendo solo informativas: nada de esto las toca.
-- Idempotente.
-- ============================================================================

alter table tarifas_settlements add column if not exists orders jsonb;

create table if not exists tarifas_trip_order_marks (
  id text primary key,
  country_id uuid not null,
  trip_id uuid not null,
  order_id uuid not null,
  mark text not null,
  reason text,
  actor text,
  constraint tarifas_trip_order_marks_country_id_fkey foreign key (country_id) references countries (id),
  constraint tarifas_trip_order_marks_trip_id_fkey foreign key (trip_id) references routes (id)
);
create index if not exists tarifas_trip_order_marks_country_id_idx on tarifas_trip_order_marks (country_id);
create index if not exists tarifas_trip_order_marks_trip_id_idx on tarifas_trip_order_marks (trip_id);
create unique index if not exists tarifas_trip_order_marks_uq on tarifas_trip_order_marks (trip_id, order_id);

-- Una fila por guía: el pedido que lleva, de quién es, cuánto vale y qué se decidió con él.
create or replace view tarifas_v_viaje_pedidos as
select g.id,
       g.route_id,
       g.guide_number,
       g.sequence_number,
       g.delivery_status,
       g.order_id,
       o.order_number,
       o.customer_id,
       c.code as customer_code,
       c.name as customer_name,
       coalesce(o.total_amount, 0)::numeric as value,
       coalesce(o.total_weight, 0)::numeric as weight_kg,
       coalesce(o.total_volume, 0)::numeric as volume_m3,
       coalesce(o.total_items, 0)::int      as items,
       m.mark,
       m.reason as mark_reason
  from dispatch_guides g
  left join orders o on o.id = g.order_id
  left join customers c on c.id = o.customer_id
  left join tarifas_trip_order_marks m on m.trip_id = g.route_id and m.order_id = g.order_id
 where g.route_id is not null;

comment on view tarifas_v_viaje_pedidos is
  'Pedidos de cada viaje (uno por guía de despacho) con su marca de liquidación. Solo lectura.';

-- El viaje: se agrega al final (CREATE OR REPLACE VIEW solo admite columnas nuevas al final).
create or replace view tarifas_v_viajes as
select r.id,
       s.country_id,
       r.route_number,
       to_char(r.route_date, 'YYYY-MM-DD') as route_date,
       case lower(btrim(coalesce(r.status, '')))
         when 'completada' then 'completed' when 'completado' then 'completed' when 'completed' then 'completed'
         when 'planificada' then 'planned' when 'planificado' then 'planned' when 'planned' then 'planned'
         when 'en_ruta' then 'in_progress' when 'en ruta' then 'in_progress' when 'en tránsito' then 'in_progress'
         when 'in_progress' then 'in_progress' when 'active' then 'in_progress' when 'despachado' then 'in_progress'
         when 'anulado' then 'cancelled' when 'anulada' then 'cancelled' when 'cancelled' then 'cancelled'
         else lower(btrim(coalesce(r.status, '')))
       end as status,
       r.carrier_id,
       c.name as carrier_name,
       c.is_flota_propia,
       r.driver_id,
       d.full_name as driver_name,
       d.document as driver_document,
       r.vehicle_id,
       v.plate as vehicle_plate,
       v.vehicle_type,
       v.capacity_weight,
       v.capacity_volume,
       r.route_type_id as dest_zone_id,
       z.code as dest_zone_code,
       z.name as dest_zone_name,
       r.total_distance,
       r.total_stops,
       r.completed_stops,
       r.total_weight,
       r.total_volume,
       r.actual_start_time,
       r.actual_end_time,
       case when r.actual_start_time is not null and r.actual_end_time > r.actual_start_time
            then round((extract(epoch from (r.actual_end_time - r.actual_start_time)) / 3600)::numeric, 2)
       end as duration_hours,
       (select count(*)::int from dispatch_guides g where g.route_id = r.id) as guide_count,
       (select count(*)::int
          from returns rt join dispatch_guides g on g.id = rt.dispatch_guide_id
         where g.route_id = r.id) as return_count,
       (select st.id from tarifas_settlements st
         where st.trip_id = r.id and st.status <> 'Anulado'
         limit 1) as settlement_id,
       (select count(*)::int from dispatch_guides g
         where g.route_id = r.id and lower(coalesce(g.delivery_status, '')) = 'delivered') as delivered_guides
  from routes r
  join stores s on s.id = r.store_id
  left join carriers c on c.id = r.carrier_id
  left join drivers d on d.id = r.driver_id
  left join vehicles v on v.id = r.vehicle_id
  left join zones z on z.id = r.route_type_id;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'tms_app') then
    execute 'grant select, insert, update, delete on public.tarifas_trip_order_marks to tms_app';
    execute 'revoke all on public.tarifas_v_viaje_pedidos from tms_app';
    execute 'grant select on public.tarifas_v_viaje_pedidos to tms_app';
  end if;
  if to_regclass('audit.tracked_tables') is not null then
    insert into audit.tracked_tables (table_name, module_key, id_column, masked_columns)
    values ('tarifas_trip_order_marks', 'tarifas', 'id', '{}')
    on conflict (table_name) do update set module_key = excluded.module_key, id_column = excluded.id_column;
    execute 'drop trigger if exists audit_row_change on public.tarifas_trip_order_marks';
    execute 'create trigger audit_row_change after insert or update or delete on public.tarifas_trip_order_marks '
            'for each row execute function audit.capture_row_change()';
  end if;
end $$;
