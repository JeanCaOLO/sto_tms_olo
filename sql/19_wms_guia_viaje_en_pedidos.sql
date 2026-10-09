-- 19_wms_guia_viaje_en_pedidos.sql
-- Agrega dos campos REALES del WMS/WMH que hoy se perdían al importar pedidos
-- de EFLOW y que el negocio pidió ver (daily 2026-10-07):
--   * order_items.guia_fiscal  <- EFLOW EXPEDICIONESDETALLE.GUIAFISCAL (guía por línea)
--   * orders.wms_trip_number   <- EFLOW EXPEDICIONESCABECERA.NUMEROVIAJEWMH
--                                  (= EFLOW_WMH.journey_orders.journey_id)
-- Idempotente. Nomenclatura snake_case como el resto del esquema actual.
-- Propiedad del modelo: data-architect (crew). Ver docs/decisions/.

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS guia_fiscal varchar;
COMMENT ON COLUMN order_items.guia_fiscal IS
  'Guía fiscal por línea (WMS EFLOW: EXPEDICIONESDETALLE.GUIAFISCAL). Puede ser NULL.';

ALTER TABLE orders ADD COLUMN IF NOT EXISTS wms_trip_number varchar;
COMMENT ON COLUMN orders.wms_trip_number IS
  'Número de viaje del WMH (WMS EFLOW: EXPEDICIONESCABECERA.NUMEROVIAJEWMH = journey_orders.journey_id). Puede ser NULL.';

GRANT SELECT, INSERT, UPDATE ON order_items TO tms_app;
GRANT SELECT, INSERT, UPDATE ON orders TO tms_app;
