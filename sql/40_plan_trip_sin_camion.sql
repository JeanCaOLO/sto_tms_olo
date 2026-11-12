-- ============================================================================
-- 40_plan_trip_sin_camion.sql — permitir viajes sin camión (cliente retira).
--
-- Los pedidos "cliente retira" no se rutean: van a una zona RETIRA, un "viaje"
-- sin vehículo. Por eso plan_trips.vehicle_id pasa a ser NULLABLE.
-- Estándar INTELIX: bloque ROLLBACK. Idempotente.
-- ============================================================================

alter table plan_trips alter column vehicle_id drop not null;

comment on column plan_trips.vehicle_id is 'Vehículo asignado; NULL en el viaje de cliente-retira (sin camión).';

-- ============================================================================
-- ROLLBACK (solo si no hay viajes de retiro con vehicle_id NULL)
-- ----------------------------------------------------------------------------
-- alter table plan_trips alter column vehicle_id set not null;
-- ============================================================================
