-- ============================================================================
-- 48 — Limpieza de pedidos del prototipo: borrar orders con store_id.
--
-- Contexto: el modelo nuevo de pedidos (sql/43, alineado a EFLOW
-- EXPEDICIONESCABECERA) NO usa store_id; el destino es final_customer_id y la
-- llave natural son las columnas eflow_id_*. Los pedidos VIEJOS del prototipo
-- (Readdy) se cargaron con store_id apuntando a stores; los NUEVOS tienen
-- store_id NULL. Se borran los viejos para dejar solo los del modelo EFLOW.
--
-- ⚠️ ORDEN DE APLICACIÓN: este script DEBE correr ANTES de
--    sql/45_orders_drop_store_id.sql (que elimina la columna). Si sql/45 ya se
--    aplicó, store_id ya no existe y este borrado no tiene criterio: en ese caso
--    NO correr este script (no hay filas "con store_id" que distinguir).
--
-- Destructivo e irreversible (los valores solo vuelven desde un snapshot de
-- Aurora, 7 días, o audit.events). CASCADA COMPLETA: esos pedidos del prototipo
-- están referenciados por varias tablas (medido en el sandbox 2026-10-21), así
-- que se borran en orden de dependencia dentro de UNA transacción:
--   tracking_events (de sus guías) → dispatch_guides → plan_stops (Planificación)
--   → order_items → orders.
-- Cruza módulos (guías/tracking/planificación), pero todo es data de prototipo
-- atada a los pedidos viejos. returns referenciando estos pedidos/guías = 0.
--
-- Uso:  node --env-file=.env scripts/run-migration.mjs sql/48_...sql            (dry-run)
--       node --env-file=.env scripts/run-migration.mjs sql/48_...sql --execute
-- ============================================================================

begin;

-- Guard: si la columna ya no existe (sql/45 ya aplicado), abortar con mensaje
-- claro en vez de fallar con un error críptico de columna inexistente.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'orders' and column_name = 'store_id'
  ) then
    raise exception 'sql/48: orders.store_id ya no existe (¿sql/45 ya aplicado?). No hay nada que borrar por este criterio.';
  end if;
end $$;

-- Conteo informativo ANTES de borrar (visible en el dry-run / log del runner).
do $$
declare
  v_total      bigint;
  v_con_store  bigint;
  v_sin_store  bigint;
begin
  select count(*) into v_total     from orders;
  select count(*) into v_con_store from orders where store_id is not null;
  select count(*) into v_sin_store from orders where store_id is null;
  raise notice 'sql/48: orders total=% | con store_id (a BORRAR)=% | sin store_id (se conservan)=%',
    v_total, v_con_store, v_sin_store;
end $$;

-- Nietos de las guías de esos pedidos (tracking y evidencias).
delete from tracking_events
where dispatch_guide_id in (
  select g.id from dispatch_guides g
  join orders o on o.id = g.order_id
  where o.store_id is not null
);
delete from tracking_evidences
where dispatch_guide_id in (
  select g.id from dispatch_guides g
  join orders o on o.id = g.order_id
  where o.store_id is not null
);

-- Devoluciones ligadas a esas guías o a esos pedidos (hoy 0, por robustez).
delete from returns
where dispatch_guide_id in (
       select g.id from dispatch_guides g
       join orders o on o.id = g.order_id
       where o.store_id is not null)
   or order_id in (select id from orders where store_id is not null);

-- Guías de despacho de esos pedidos.
delete from dispatch_guides
where order_id in (select id from orders where store_id is not null);

-- Paradas de Planificación que referencian esos pedidos.
delete from plan_stops
where order_id in (select id from orders where store_id is not null);

-- Líneas del pedido (EXPEDICIONESDETALLE).
delete from order_items
where order_id in (select id from orders where store_id is not null);

-- Pedidos viejos del prototipo.
delete from orders
where store_id is not null;

-- Validación: no debe quedar ningún pedido con store_id.
do $$
declare
  v_restantes bigint;
begin
  select count(*) into v_restantes from orders where store_id is not null;
  if v_restantes <> 0 then
    raise exception 'Validación sql/48: quedan % pedidos con store_id', v_restantes;
  end if;
  raise notice 'Validación sql/48: OK (0 pedidos con store_id)';
end $$;

-- ROLLBACK: no hay rollback de datos borrados. Recuperación solo desde snapshot
-- de Aurora (7 días) o desde audit.events si el borrado quedó auditado.

commit;
