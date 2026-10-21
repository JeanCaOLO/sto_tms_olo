-- ============================================================================
-- 34 — Zonas con geocerca (polígono en el mapa) y zona de cada punto de entrega.
--
-- Pedido del usuario (2026-10-12):
--   - Una zona pertenece a un PAÍS y se delimita dibujando una cerca en el
--     mapa de ese país (`zones.geofence`, GeoJSON Polygon/MultiPolygon en
--     WGS84; `zones.color` para pintarla).
--   - Cada PUNTO DE ENTREGA (cliente final) cae AUTOMÁTICAMENTE en la zona
--     cuya cerca lo contiene, pero el usuario puede cambiarla a mano.
--   - Las zonas actuales de Costa Rica se renombran al formato Zn
--     ("01 · Casco Central" -> "Z1 · Casco Central") y se les dibuja una cerca
--     aproximada a partir de los puntos de Cofersa que ya tienen esa zona.
--
-- `zones.code` NO cambia: las reglas de tarifa (`destZone` IN ('09', ...)) y la
-- ingesta del WMS (ruta -> zones.code) lo usan. Solo cambia el nombre visible.
--
-- delivery_points.zone_source dice de dónde salió la zona del punto:
--   'map'    automática por la cerca (se recalcula sola; null si no cae en ninguna)
--   'manual' la eligió el usuario (el mapa ya no la toca)
--   'wms'    vino de la ruta del WMS en la ingesta (el mapa no la toca)
-- Para devolver un punto a automático: UPDATE ... SET zone_source = 'map'.
--
-- Recalculo automático (triggers):
--   - al crear/editar/desactivar una zona o cambiar su cerca -> puntos del país
--   - al cambiar las coordenadas de una dirección            -> su punto
--   - al crear un punto sin zona                              -> ese punto
-- Si un punto cae en varias cercas, gana la de MENOR área (la más específica).
--
-- Idempotente; nunca destructivo (no borra zonas ni datos).
-- ============================================================================

begin;

create extension if not exists postgis;

alter table zones add column if not exists geofence jsonb;
alter table zones add column if not exists color text;
alter table zones drop constraint if exists zones_geofence_geojson_check;
alter table zones add constraint zones_geofence_geojson_check
  check (geofence is null or geofence->>'type' in ('Polygon', 'MultiPolygon'));

alter table delivery_points add column if not exists zone_source text;
update delivery_points set zone_source = case when zone_id is not null then 'wms' else 'map' end
where zone_source is null;
alter table delivery_points alter column zone_source set default 'map';
alter table delivery_points alter column zone_source set not null;
alter table delivery_points drop constraint if exists delivery_points_zone_source_check;
alter table delivery_points add constraint delivery_points_zone_source_check
  check (zone_source in ('map', 'manual', 'wms'));

-- Zona (activa, con cerca, del país) que contiene el punto; la de menor área si hay varias.
create or replace function zone_for_point(p_country_id uuid, p_latitude numeric, p_longitude numeric)
returns uuid language sql stable as $$
  select z.id
  from zones z
  cross join lateral (select ST_SetSRID(ST_GeomFromGeoJSON(z.geofence::text), 4326) as geom) g
  where p_latitude is not null and p_longitude is not null
    and z.country_id = p_country_id and z.status = 'active' and z.geofence is not null
    and ST_Covers(g.geom, ST_SetSRID(ST_MakePoint(p_longitude::float8, p_latitude::float8), 4326))
  order by ST_Area(g.geom), z.code
  limit 1
$$;

-- Recalcula la zona de los puntos automáticos ('map') de un país (o de una
-- dirección). Devuelve cuántos cambiaron. Marca la transacción con
-- tms.zone_source_explicit para que el trigger de delivery_points no lo
-- confunda con un cambio manual (la ingesta del WMS usa la misma marca).
create or replace function assign_zones_by_map(p_country_id uuid, p_address_id uuid default null)
returns integer language plpgsql as $$
declare
  changed integer;
  previous text := coalesce(current_setting('tms.zone_source_explicit', true), 'off');
begin
  perform set_config('tms.zone_source_explicit', 'on', true);
  with target as (
    select dp.id, zone_for_point(a.country_id, a.latitude, a.longitude) as zone_id
    from delivery_points dp
    join addresses a on a.id = dp.address_id
    where dp.zone_source = 'map' and a.country_id = p_country_id
      and (p_address_id is null or a.id = p_address_id)
  )
  update delivery_points dp set zone_id = t.zone_id, updated_at = now()
  from target t
  where dp.id = t.id and dp.zone_id is distinct from t.zone_id;
  get diagnostics changed = row_count;
  perform set_config('tms.zone_source_explicit', previous, true);
  return changed;
end
$$;

-- Origen de la zona al escribir un punto:
--   - con tms.zone_source_explicit = 'on' (recalculo automático, ingesta del
--     WMS) pasa tal cual: quien escribe ya fijó zone_source;
--   - si quien escribe cambia zone_source explícitamente, se respeta
--     ('map' = volver a automático: se recalcula ya);
--   - si solo cambia zone_id, es una elección manual.
create or replace function delivery_points_zone_source()
returns trigger language plpgsql as $$
declare
  addr record;
begin
  if coalesce(current_setting('tms.zone_source_explicit', true), 'off') = 'on' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.zone_id is not null and new.zone_source = 'map' then
      new.zone_source := 'manual';
    end if;
  elsif new.zone_source is distinct from old.zone_source then
    null;  -- cambio explícito de origen: se respeta
  elsif new.zone_id is distinct from old.zone_id then
    new.zone_source := 'manual';
  end if;
  if new.zone_source = 'map' then
    select country_id, latitude, longitude into addr from addresses where id = new.address_id;
    new.zone_id := case when found then zone_for_point(addr.country_id, addr.latitude, addr.longitude) end;
  end if;
  return new;
end
$$;

drop trigger if exists delivery_points_zone_source_trg on delivery_points;
create trigger delivery_points_zone_source_trg
  before insert or update of zone_id, zone_source, address_id on delivery_points
  for each row execute function delivery_points_zone_source();

create or replace function zones_reassign_points()
returns trigger language plpgsql as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform assign_zones_by_map(old.country_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') and (tg_op = 'INSERT' or new.country_id is distinct from old.country_id) then
    perform assign_zones_by_map(new.country_id);
  end if;
  return null;
end
$$;

drop trigger if exists zones_reassign_points_trg on zones;
create trigger zones_reassign_points_trg
  after insert or update of geofence, status, country_id or delete on zones
  for each row execute function zones_reassign_points();

create or replace function addresses_reassign_point()
returns trigger language plpgsql as $$
begin
  perform assign_zones_by_map(new.country_id, new.id);
  return null;
end
$$;

drop trigger if exists addresses_reassign_point_trg on addresses;
create trigger addresses_reassign_point_trg
  after update of latitude, longitude, country_id on addresses
  for each row
  when (old.latitude is distinct from new.latitude or old.longitude is distinct from new.longitude
        or old.country_id is distinct from new.country_id)
  execute function addresses_reassign_point();

-- Zonas de Costa Rica: nombre en formato Zn (el código no cambia).
update zones z
set name = 'Z' || (z.code::int)::text || ' · ' || regexp_replace(z.name, '^\s*\d+\s*[^[:alnum:][:space:]]\s*', ''),
    updated_at = now()
from countries c
where c.id = z.country_id and c.code = 'CR' and z.code ~ '^\d+$'
  and z.name ~ '^\s*\d+\s*[^[:alnum:][:space:]]';

-- Cerca aproximada de cada zona de CR que aún no tiene: envolvente convexa de
-- sus puntos (de la ingesta del WMS) sin los atípicos (más lejos del centro
-- -mediana geométrica- que 2,5× la distancia mediana: algunos puntos traen del
-- WMS una zona que no corresponde a su ubicación), con un margen de ~1 km.
with pts as (
  select z.id as zone_id, ST_SetSRID(ST_MakePoint(a.longitude::float8, a.latitude::float8), 4326) as geom
  from zones z
  join countries c on c.id = z.country_id and c.code = 'CR'
  join delivery_points dp on dp.zone_id = z.id
  join addresses a on a.id = dp.address_id
  where z.geofence is null and a.latitude is not null and a.longitude is not null
), centers as (
  select zone_id, ST_GeometricMedian(ST_Collect(geom)) as center from pts group by zone_id
), dist as (
  select p.zone_id, p.geom, ST_Distance(p.geom, c.center) as d from pts p join centers c using (zone_id)
), limits as (
  select zone_id, percentile_cont(0.5) within group (order by d) as p50 from dist group by zone_id
), hulls as (
  select d.zone_id, ST_Buffer(ST_ConvexHull(ST_Collect(d.geom)), 0.01) as geom
  from dist d join limits l using (zone_id)
  where d.d <= 2.5 * l.p50
  group by d.zone_id
  having count(*) >= 3
)
update zones z
set geofence = ST_AsGeoJSON(h.geom, 6)::jsonb, updated_at = now()
from hulls h
where z.id = h.zone_id;

commit;
