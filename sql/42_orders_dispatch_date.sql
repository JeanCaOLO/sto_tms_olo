-- ============================================================================
-- 42_orders_dispatch_date.sql — fecha de SALIDA del viaje, denormalizada en el
-- pedido para el handoff Planificacion -> OMS.
--
-- El OMS necesita soltar cada pedido a alistar UN DIA ANTES de que salga, no de
-- golpe (reuniones 2026-10-19/20, Antonio/Eduardo). La fecha de salida es la de
-- ENTREGA menos los dias de transito del cluster:
--     dispatch_date = delivery_date - lead_time_days
-- Planificacion ya calcula lead_time_days al armar el viaje; aqui lo estampa
-- resuelto como fecha para que el OMS lea una fecha simple (dispatch_date - 1 es
-- politica del OMS). NULL = sin calculo (sin coordenadas); el OMS aplica su default.
--
-- Amplia el reparto de 37_planif_oms_contract.sql: Planif escribe ademas
-- orders.dispatch_date. Estandar OLTP INTELIX: snake_case, bloque ROLLBACK.
-- Aurora PostgreSQL. Idempotente.
-- ============================================================================

alter table orders
  add column if not exists dispatch_date date;

comment on column orders.dispatch_date is 'Fecha de SALIDA del viaje (delivery_date - lead_time_days) que estampa Planificacion. El OMS libera a alistar un dia antes de esta fecha. NULL = sin calculo (el OMS aplica su default).';

-- Cola del OMS por dia de alisto: pedidos planificados cuya salida es inminente.
create index if not exists idx_orders_dispatch_date on orders (dispatch_date) where dispatch_date is not null;

-- ============================================================================
-- ROLLBACK (descomentar para deshacer)
-- ----------------------------------------------------------------------------
-- drop index if exists idx_orders_dispatch_date;
-- alter table orders drop column if exists dispatch_date;
-- ============================================================================
