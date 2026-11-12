-- ============================================================================
-- 37_planif_oms_contract.sql — columnas del handoff Planificacion -> OMS.
--
-- Con el flujo INVERTIDO (Planif corre primero, el OMS lee `orders`), Planif
-- debe dejar su resultado EN orders para que el OMS arme su cola. Esto revisa el
-- marco de ADR-0004 (que quito `wms_trip_number` por "dato legado que nadie
-- lee"): ahora si se lee, pero NO es el nro legado del WMH; es el nro de viaje
-- que asigna el planificador. Por eso la columna nueva es `numero_viaje`, no se
-- re-crea `wms_trip_number`.
--
-- Reparto acordado de escritura:
--   Planif escribe: numero_viaje, lead_time_days, planning_run_id, delivery_zone
--   OMS escribe:    priority, wms_status/wms_situation='GENE', oms_score,
--                   handoff_status, prioritization_run_id, oms_processed_at
-- Cola del OMS: planning_run_id IS NOT NULL AND oms_processed_at IS NULL.
--
-- Estandar OLTP INTELIX: snake_case, prefijo idx_ en indices, bloque ROLLBACK.
-- Nota: tms_olo es el esquema migrado y NO usa prefijo tbl_ en las tablas; se
-- mantiene la consistencia del esquema existente. Aurora PostgreSQL. Idempotente.
-- ============================================================================

-- --- orders: resultado del plan que el OMS consume ---------------------------
alter table orders
  add column if not exists numero_viaje     text,
  add column if not exists lead_time_days   integer,
  add column if not exists planning_run_id  uuid,
  add column if not exists oms_processed_at timestamptz;

comment on column orders.numero_viaje     is 'Nro de viaje que asigna Planificacion (no el NUMEROVIAJEWMH legado). Senal de viaje asignado para el OMS.';
comment on column orders.lead_time_days   is 'Duracion logistica del cluster (dias) estampada por Planificacion; el OMS la usa para la regla de fecha. NULL = sin calculo (el OMS aplica su default).';
comment on column orders.planning_run_id  is 'Id de la corrida de planificacion que toco este pedido (correlacion + lote). Lo escribe Planificacion.';
comment on column orders.oms_processed_at is 'Marca now() que escribe SOLO el OMS al terminar de procesar el pedido. Planificacion no la toca.';

create index if not exists idx_orders_cola_oms on orders (planning_run_id) where oms_processed_at is null;

-- --- plan_trips: canonicas del viaje -----------------------------------------
alter table plan_trips
  add column if not exists numero_viaje   text,
  add column if not exists lead_time_days integer;

comment on column plan_trips.numero_viaje   is 'Nro de viaje asignado por el planificador (canonico; se denormaliza en orders.numero_viaje).';
comment on column plan_trips.lead_time_days is 'Duracion logistica del cluster (dias), canonica; se denormaliza en orders.lead_time_days.';

-- ============================================================================
-- ROLLBACK (descomentar y ejecutar en orden descendente para deshacer)
-- ----------------------------------------------------------------------------
-- alter table plan_trips drop column if exists lead_time_days;
-- alter table plan_trips drop column if exists numero_viaje;
-- drop index if exists idx_orders_cola_oms;
-- alter table orders drop column if exists oms_processed_at;
-- alter table orders drop column if exists planning_run_id;
-- alter table orders drop column if exists lead_time_days;
-- alter table orders drop column if exists numero_viaje;
-- ============================================================================
