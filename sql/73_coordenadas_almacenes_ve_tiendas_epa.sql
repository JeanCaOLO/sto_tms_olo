-- ============================================================================
-- 73 — Coordenadas de los almacenes de Venezuela y de las tiendas de EPA (2026-11-16).
--
-- Datos dados por el usuario el 2026-11-16 para el motor de ruteo:
--   - Almacenes (depósito de salida de los viajes, ruta_geo.sede_de):
--       MICHELENA  10.17821967255664,  -67.95059139482397
--       SAN-DIEGO  10.178367977475439, -67.95088019080177
--   - Tiendas de EPA (Costa Rica), dirección de su punto de entrega por defecto. El
--     planificador toma estas coordenadas cuando eFlow no las trae en el pedido
--     (plan_builder.PUNTO_ENTREGA). Se casan por el código del cliente destino de EPA:
--       002 CURRIDABAT  9.935147615180089,  -84.03751735779285
--       003 ESCAZU      9.944722069627227,  -84.1275927321667
--       004 BELEN       9.997057455542901,  -84.16647418873094
--       005 TIBAS       9.960678870213018,  -84.08417510566994
--       006 DESAMPARADOS 9.891739910494476, -84.06603042593999
--       007 LIBERIA     10.634974056123914, -85.52987465570826
--       008 CARTAGO     9.880887087223371,  -83.94614593486688
--     La 001 ("TIENDA 001 CD") queda sin coordenadas: pendiente de confirmar con el usuario.
--
-- Validación: cada fila debe quedar actualizada (si no, aborta toda la migración).
-- Aplicar con: node --env-file=.env.local scripts/run-migration.mjs sql/73_coordenadas_almacenes_ve_tiendas_epa.sql [--execute]
-- Deshacer con: sql/73_coordenadas_almacenes_ve_tiendas_epa_rollback.sql
-- Idempotente.
-- ============================================================================

begin;

update tbl_warehouses w
   set latitude = v.lat, longitude = v.lng, updated_at = now()
  from (values ('MICHELENA', 10.17821967255664, -67.95059139482397),
               ('SAN-DIEGO', 10.178367977475439, -67.95088019080177)) as v(code, lat, lng)
 where w.code = v.code;

update tbl_addresses a
   set latitude = v.lat, longitude = v.lng, geocoding_status = 'OK', geocoding_provider = 'manual',
       geocoded_at = now(), updated_at = now()
  from tbl_delivery_points dp
  join tbl_final_customers fc on fc.id = dp.final_customer_id
  join tbl_customers c on c.id = fc.customer_id
  join tbl_countries co on co.id = c.country_id,
       (values ('002', 9.935147615180089, -84.03751735779285),
               ('003', 9.944722069627227, -84.1275927321667),
               ('004', 9.997057455542901, -84.16647418873094),
               ('005', 9.960678870213018, -84.08417510566994),
               ('006', 9.891739910494476, -84.06603042593999),
               ('007', 10.634974056123914, -85.52987465570826),
               ('008', 9.880887087223371, -83.94614593486688)) as v(code, lat, lng)
 where a.id = dp.address_id and dp.is_default
   and c.name = 'EPA' and co.code = 'CR' and fc.customer_type = 'TIENDA' and fc.external_code = v.code;

do $$
declare almacenes int; tiendas int;
begin
  select count(*) into almacenes from tbl_warehouses
   where code in ('MICHELENA', 'SAN-DIEGO') and latitude is not null and longitude is not null;
  select count(*) into tiendas
    from tbl_delivery_points dp
    join tbl_final_customers fc on fc.id = dp.final_customer_id
    join tbl_customers c on c.id = fc.customer_id
    join tbl_countries co on co.id = c.country_id
    join tbl_addresses a on a.id = dp.address_id
   where c.name = 'EPA' and co.code = 'CR' and fc.customer_type = 'TIENDA' and dp.is_default
     and fc.external_code in ('002', '003', '004', '005', '006', '007', '008') and a.latitude is not null;
  if almacenes <> 2 or tiendas <> 7 then
    raise exception '73: se esperaban 2 almacenes y 7 tiendas con coordenadas; quedaron % y %', almacenes, tiendas;
  end if;
end $$;

commit;
