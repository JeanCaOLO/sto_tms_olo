-- ============================================================================
-- 73 ROLLBACK — Deja como estaban las coordenadas que cargó sql/73.
--
-- Antes de sql/73 (consultado el 2026-11-16): almacenes MICHELENA y SAN-DIEGO sin
-- coordenadas; direcciones de las tiendas 002–008 de EPA sin coordenadas, estado PENDING,
-- proveedor 'stores' (002–006, 008) o NULL (007), geocoded_at NULL.
-- Aplicar con: node --env-file=.env.local scripts/run-migration.mjs sql/73_coordenadas_almacenes_ve_tiendas_epa_rollback.sql [--execute]
-- ============================================================================

begin;

update tbl_warehouses set latitude = null, longitude = null, updated_at = now()
 where code in ('MICHELENA', 'SAN-DIEGO');

update tbl_addresses a
   set latitude = null, longitude = null, geocoding_status = 'PENDING',
       geocoding_provider = case when fc.external_code = '007' then null else 'stores' end,
       geocoded_at = null, updated_at = now()
  from tbl_delivery_points dp
  join tbl_final_customers fc on fc.id = dp.final_customer_id
  join tbl_customers c on c.id = fc.customer_id
  join tbl_countries co on co.id = c.country_id
 where a.id = dp.address_id and dp.is_default
   and c.name = 'EPA' and co.code = 'CR' and fc.customer_type = 'TIENDA'
   and fc.external_code in ('002', '003', '004', '005', '006', '007', '008');

commit;
