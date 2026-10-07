-- NO APLICADA en Aurora: referencia. El modulo tarifas no altera la estructura de AWS (ver docs/tarifador/RUNBOOK_OPTIMIZACION_AURORA.md).
-- ============================================================================
-- 27 — Vista de viajes del tarifador: un solo recorrido de las guías por viaje.
--
-- `tarifas_v_viajes` calculaba `guide_count` y `delivered_guides` con dos subconsultas sobre
-- `dispatch_guides` por cada viaje. Ahora es una sola (`cross join lateral`). Mismas columnas, mismo
-- orden y mismos valores: solo cambia cómo se calculan (CREATE OR REPLACE VIEW lo exige).
--
-- No se tocan las tablas de otros módulos (`routes`, `dispatch_guides`): `route_date` y `status` siguen
-- siendo expresiones de la vista; indexarlas exigiría un índice sobre `routes`, que no es del tarifador.
--
-- Idempotente. ROLLBACK: volver a correr la definición de `tarifas_v_viajes` de sql/24.
-- ============================================================================

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
       gc.guide_count,
       (select count(*)::int
          from returns rt join dispatch_guides g on g.id = rt.dispatch_guide_id
         where g.route_id = r.id) as return_count,
       (select st.id from tarifas_settlements st
         where st.trip_id = r.id and st.status <> 'Anulado'
         limit 1) as settlement_id,
       gc.delivered_guides
  from routes r
  join stores s on s.id = r.store_id
  left join carriers c on c.id = r.carrier_id
  left join drivers d on d.id = r.driver_id
  left join vehicles v on v.id = r.vehicle_id
  left join zones z on z.id = r.route_type_id
  -- Una sola lectura de las guías del viaje para los dos conteos (antes eran dos subconsultas).
  cross join lateral (
    select count(*)::int as guide_count,
           (count(*) filter (where lower(coalesce(g.delivery_status, '')) = 'delivered'))::int as delivered_guides
      from dispatch_guides g
     where g.route_id = r.id
  ) gc;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'tms_app') then
    execute 'revoke all on public.tarifas_v_viajes from tms_app';
    execute 'grant select on public.tarifas_v_viajes to tms_app';
  end if;
end $$;
