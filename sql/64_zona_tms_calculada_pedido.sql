-- ============================================================================
-- 64_zona_tms_calculada_pedido.sql — zona TMS del pedido, calculada por coordenadas.
--
-- Reunión 2026-11-06 (Ana/Eduardo): el pedido guarda dos zonas. `delivery_zone` es el código que
-- manda eFlow y no se toca. `tms_zone_id` es la zona del catálogo `tbl_zones` donde cae la
-- coordenada de entrega; de ahí el OMS lee los días de anticipo (nulo = 1 día por omisión).
--
-- - Renombra `tbl_orders.route_type_id` a `tms_zone_id`: ya era FK a `tbl_zones` (nombre viejo de
--   antes de sql/09) y solo la tenían 706 pedidos de la carga demo del 2026-09-26.
-- - `fn_zona_tms`: zona del país de la bodega cuya geocerca (GeoJSON) contiene el punto. Las
--   geocercas se pisan; gana la más chica (la más específica).
-- - Trigger: se recalcula al insertar o al cambiar coordenadas o bodega (la ingesta de eFlow,
--   o cualquier otro escritor). Recalcular todo tras editar geocercas: el UPDATE del final.
--
-- Estándar OLTP INTELIX (sql/README.md). Aurora PostgreSQL + PostGIS. Idempotente.
-- ============================================================================

do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'tbl_orders' and column_name = 'route_type_id') then
    alter table public.tbl_orders rename column route_type_id to tms_zone_id;
  end if;
  if exists (select 1 from pg_constraint where conname = 'fk_order_zone') then
    alter table public.tbl_orders rename constraint fk_order_zone to fk_orders_tms_zone;
  end if;
end $$;

comment on column public.tbl_orders.tms_zone_id is
  'Zona TMS (tbl_zones) donde cae la coordenada de entrega. La calcula trg_orders_tms_zone; nula si no hay coordenada o geocerca que la contenga.';

-- ponytail: recorre las ~15 geocercas por fila (ST_GeomFromGeoJSON en caliente). Si el catálogo
-- crece a cientos de zonas, pasar geofence a una columna geometry con índice GiST.
create or replace function public.fn_zona_tms(p_lat numeric, p_lng numeric, p_warehouse_id uuid)
returns uuid language sql stable as $$
  select z.id
  from public.tbl_zones z
  join public.tbl_warehouses w on w.country_id = z.country_id
  where w.id = p_warehouse_id
    and z.geofence is not null
    and p_lat is not null and p_lng is not null
    and ST_Covers(ST_GeomFromGeoJSON(z.geofence::text),
                  ST_SetSRID(ST_MakePoint(p_lng::float8, p_lat::float8), 4326))
  order by ST_Area(ST_GeomFromGeoJSON(z.geofence::text)), z.code
  limit 1
$$;

create or replace function public.fn_orders_set_tms_zone()
returns trigger language plpgsql as $$
begin
  new.tms_zone_id := public.fn_zona_tms(new.delivery_latitude, new.delivery_longitude, new.warehouse_id);
  return new;
end $$;

drop trigger if exists trg_orders_tms_zone on public.tbl_orders;
create trigger trg_orders_tms_zone
  before insert or update of delivery_latitude, delivery_longitude, warehouse_id on public.tbl_orders
  for each row execute function public.fn_orders_set_tms_zone();

-- Relleno (también reemplaza los valores de la carga demo).
update public.tbl_orders
set tms_zone_id = public.fn_zona_tms(delivery_latitude, delivery_longitude, warehouse_id)
where tms_zone_id is distinct from public.fn_zona_tms(delivery_latitude, delivery_longitude, warehouse_id);
