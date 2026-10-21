-- ============================================================================
-- 46 — Dropear orders.wms_trip_number (reemplazada por orders.numero_viaje).
--
-- Contrato de integración OMS↔Planificación cerrado (confirmado con negocio y
-- con la IA de Planificación): el número de viaje del pedido es
-- `orders.numero_viaje` (formato 'YYYYMMDD-NNN'), que puebla Planificación. La
-- columna `orders.wms_trip_number` quedó ELIMINADA del contrato (ADR-0004 de
-- Planificación) y no la usa nadie del lado del OMS.
--
-- Historia: la agregó sql/19_wms_guia_viaje_en_pedidos.sql (NO sql/20). El
-- comentario de sql/43 que decía que fue 'retirada a propósito en sql/20' era
-- incorrecto; esta migración es la que de verdad la retira. sql/19 se conserva
-- intacto porque ahí también vive order_items.guia_fiscal, que SÍ se mantiene.
--
-- Idempotente (DROP ... IF EXISTS): correrla dos veces no falla.
--
-- Uso:  node --env-file=.env scripts/run-migration.mjs sql/46_...sql            (dry-run)
--       node --env-file=.env scripts/run-migration.mjs sql/46_...sql --execute
-- ============================================================================

begin;

alter table orders drop column if exists wms_trip_number;

-- ROLLBACK (solo si hiciera falta volver atrás; la agregó sql/19):
-- alter table orders add column if not exists wms_trip_number varchar;
-- comment on column orders.wms_trip_number is
--   'Número de viaje del WMH (WMS EFLOW: EXPEDICIONESCABECERA.NUMEROVIAJEWMH = journey_orders.journey_id). Puede ser NULL.';

-- Validación: aborta si la columna sigue existiendo.
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_name = 'orders' and column_name = 'wms_trip_number') then
    raise exception 'Validación sql/46: orders.wms_trip_number TODAVÍA existe';
  end if;
  raise notice 'Validación sql/46: OK (orders.wms_trip_number dropeada; usar orders.numero_viaje)';
end $$;

commit;
