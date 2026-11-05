-- ============================================================================
-- 56_orders_delivery_date_change_count.sql — contador de modificaciones de la
-- FECHA DE ENTREGA por pedido, para el Panel del OMS.
--
-- La reunión (2026-11-03) pidió mostrar en el dashboard del OMS cuántas veces se
-- le ha cambiado la fecha de entrega a los pedidos. Ese cambio se hará con la
-- función de "editar fecha de entrega con aprobación de coordinador" (aún por
-- construir): cada edición aprobada debe INCREMENTAR este contador. Hasta que esa
-- función exista, el contador queda en 0 (default) y el panel mostrará 0 — no se
-- inventa dato.
--
-- Solo cuenta modificaciones de delivery_date hechas DESDE el TMS/OMS (edición con
-- aprobación), no la FECHAMODIFICACION del WMS (eso es wms_modified_at).
--
-- Estándar OLTP INTELIX: snake_case, NOT NULL con default, bloque ROLLBACK.
-- Aurora PostgreSQL. Idempotente.
--
-- Uso:  node --env-file=.env scripts/run-migration.mjs sql/56_...sql            (dry-run)
--       node --env-file=.env scripts/run-migration.mjs sql/56_...sql --execute
-- ============================================================================

alter table orders
  add column if not exists delivery_date_change_count integer not null default 0;

comment on column orders.delivery_date_change_count is 'Veces que se ha modificado la fecha de entrega del pedido desde el TMS/OMS (edición con aprobación de coordinador). Lo incrementa cada edición aprobada; 0 = sin modificaciones. Distinto de wms_modified_at (modificación del WMS).';

alter table orders add constraint ck_order_delivery_date_change_count check (delivery_date_change_count >= 0);

-- ============================================================================
-- ROLLBACK (descomentar para deshacer)
-- ----------------------------------------------------------------------------
-- alter table orders drop constraint if exists ck_order_delivery_date_change_count;
-- alter table orders drop column if exists delivery_date_change_count;
-- ============================================================================
