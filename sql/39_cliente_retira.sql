-- ============================================================================
-- 39_cliente_retira.sql — flag "cliente retira" (Capa 1, por patrón de texto).
--
-- En eFlow NO hay campo estructurado para cliente-retira: vive en el texto libre
-- de OBSERVACIONESEXPEDICION ("CLIENTE RETIRA", "RETIRAN", "RETIRA <nombre>"…).
-- El ingest trae la observación y marca es_cliente_retira con la regla de patrón
-- (Capa 1). La Capa 2 (IA Bedrock para ambiguos) queda para después.
--
-- Estándar OLTP INTELIX: snake_case, prefijo idx_, bloque ROLLBACK. Idempotente.
-- ============================================================================

alter table orders
  add column if not exists observaciones     text,
  add column if not exists es_cliente_retira boolean not null default false;

comment on column orders.observaciones     is 'OBSERVACIONESEXPEDICION de eFlow (texto libre) tal cual.';
comment on column orders.es_cliente_retira is 'true = el cliente retira en almacén (no se entrega). Capa 1: patrón de texto sobre observaciones.';

-- Filtro rápido de la cola de cliente-retira.
create index if not exists idx_orders_cliente_retira on orders (es_cliente_retira) where es_cliente_retira;

-- Se arrastra a la parada del plan para la UI.
alter table plan_stops
  add column if not exists es_cliente_retira boolean not null default false;

comment on column plan_stops.es_cliente_retira is 'Arrastrado de orders: la parada es un retiro en almacén, no una entrega.';

-- ============================================================================
-- ROLLBACK (descomentar y ejecutar en orden descendente)
-- ----------------------------------------------------------------------------
-- alter table plan_stops drop column if exists es_cliente_retira;
-- drop index if exists idx_orders_cliente_retira;
-- alter table orders drop column if exists es_cliente_retira;
-- alter table orders drop column if exists observaciones;
-- ============================================================================
