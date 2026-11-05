-- ============================================================================
-- 57_orders_priority_allow_zero.sql — permitir prioridad 0 en orders.
--
-- DECIDED (prioridad de Cofersa 0..n, 2026-10-29) + aclaración 2026-11-04: los
-- números bajan al acercarse la salida (1 = alta, se libera pronto) y AL LIBERAR
-- el pedido pasa a prioridad 0 (máxima: "ya se va"), que es la que se manda a eFlow.
-- La cola de priorización nunca muestra 0 porque solo lista los NO liberados; 0 es
-- el marcador del pedido ya liberado. EPA NO cambia (conserva su prioridad de EFLOW).
--
-- El CHECK actual (`priority >= 1`, sql/43) prohíbe guardar 0. Se relaja a `>= 0`.
--
-- NOTA (esquema refactorizado): la tabla real ahora es `public.tbl_orders` y
-- `public.orders` es una VISTA auto-actualizable sobre ella (convención `tbl_`). El
-- DML del app sigue por la vista; el DDL (este CHECK) va a la tabla `tbl_orders`.
--
-- Estándar OLTP INTELIX. Aurora PostgreSQL. Idempotente.
--
-- Uso:  node --env-file=.env scripts/run-migration.mjs sql/57_...sql            (dry-run)
--       node --env-file=.env scripts/run-migration.mjs sql/57_...sql --execute
-- ============================================================================

alter table tbl_orders drop constraint if exists ck_order_priority;
alter table tbl_orders add constraint ck_order_priority check (priority >= 0);

-- ============================================================================
-- ROLLBACK (descomentar para deshacer). OJO: volver a `>= 1` falla si ya hay
-- pedidos liberados con priority = 0; primero habría que subirlos (o no revertir).
-- ----------------------------------------------------------------------------
-- alter table tbl_orders drop constraint if exists ck_order_priority;
-- alter table tbl_orders add constraint ck_order_priority check (priority >= 1);
-- ============================================================================
