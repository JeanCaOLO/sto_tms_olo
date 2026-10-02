-- ============================================================================
-- 13 — Tiendas de EPA como puntos de entrega del cliente EPA.
--
-- Decisión del usuario (2026-09-23): la pantalla Puntos de Entrega pasa de
-- `stores` a `delivery_points` (cliente → cliente final → punto → dirección).
-- Las tiendas de EPA (T002…T008) ya existen como final_customers de EPA con
-- el mismo código; se les crea su dirección y su punto de entrega por defecto
-- copiando dirección/ciudad/coordenadas de `stores`.
--
-- `stores` NO se toca: la bodega de origen (CD-CR, is_origin) sigue ahí y la
-- usan orders/routes; las filas de tiendas también quedan (orders.store_id).
-- Idempotente: no crea el punto si el cliente final ya lo tiene.
-- ============================================================================

begin;

with epa_stores as (
  select fc.id as final_customer_id, s.code, s.name, s.address, s.city, s.state, s.latitude, s.longitude,
         s.country_id, gen_random_uuid() as address_id
  from stores s
  join customers c on c.code = 'EPA'
  join final_customers fc on fc.customer_id = c.id and fc.external_code = s.code
  where s.is_origin is not true
    and not exists (select 1 from delivery_points d where d.final_customer_id = fc.id and d.external_code = s.code)
), new_addresses as (
  insert into addresses (id, country_id, line1, city, state, latitude, longitude, geocoding_status, geocoding_provider)
  select address_id, country_id, address, city, state, latitude, longitude,
         case when latitude is not null and longitude is not null then 'OK' else 'PENDING' end, 'stores'
  from epa_stores
  returning id
)
insert into delivery_points (final_customer_id, address_id, external_code, name, is_default, active)
select e.final_customer_id, e.address_id, e.code, e.name,
       not exists (select 1 from delivery_points d where d.final_customer_id = e.final_customer_id and d.is_default),
       true
from epa_stores e;

commit;
