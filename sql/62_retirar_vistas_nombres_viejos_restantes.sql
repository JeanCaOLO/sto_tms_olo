-- ============================================================================
-- 62_retirar_vistas_nombres_viejos_restantes.sql — borra las 3 vistas con nombre viejo que
-- la sql/61 no alcanzó porque no tenían el comentario 'compat:estandar-oltp-59':
--   - orders: se recreó sin el comentario después de la 59;
--   - tracking_client_access y tracking_stop_visits: vistas de tablas nuevas de tracking.
-- Pedido explícito del 2026-11-05 ("matá las vistas"). Ningún objeto depende de ellas y
-- el código de main no las usa. Las ramas sin traer main (p. ej. `josef`) deben usar tbl_*.
--
-- Estándar OLTP INTELIX (sql/README.md). Aurora PostgreSQL. Idempotente.
-- ============================================================================

drop view if exists public.orders;
drop view if exists public.tracking_client_access;
drop view if exists public.tracking_stop_visits;

-- ============================================================================
-- ROLLBACK (descomentar y ejecutar; definición, dueño y GRANT tal como estaban el 2026-11-05)
-- ----------------------------------------------------------------------------
-- create or replace view public.orders as SELECT id, organization_id, customer_id, order_number, invoice_number, order_date, delivery_date, total_weight, total_volume, total_items, total_amount, delivery_address, delivery_city, delivery_latitude, delivery_longitude, delivery_zone, priority, status, notes, created_at, updated_at, route_type_id, delivery_point_id, warehouse_id, branch_id, final_customer_id, destination_warehouse_id, eflow_id_almacen, eflow_id_compania, eflow_id_sucursal, eflow_id_expedicion, eflow_id_cliente, order_type, wms_status, wms_situation, drop_code, emergency, erp_document, generated_at, closed_at, planned_dispatch_at, wms_created_at, wms_modified_at, oms_score, handoff_status, prioritization_run_id, numero_viaje, lead_time_days, planning_run_id, oms_processed_at, observaciones, es_cliente_retira, dispatch_date, delivery_date_eflow, delivery_date_changed_at, delivery_date_changed_by, delivery_date_change_count FROM tbl_orders;
-- alter view public.orders owner to olo_db; revoke all on public.orders from tms_app;
-- grant insert, select, update, delete on public.orders to tms_app;
-- create or replace view public.tracking_client_access as SELECT id, organization_id, app_user_id, delivery_point_id, final_customer_id, created_at FROM tbl_tracking_client_access;
-- alter view public.tracking_client_access owner to olo_db; revoke all on public.tracking_client_access from tms_app;
-- grant insert, select, update, delete on public.tracking_client_access to tms_app;
-- create or replace view public.tracking_stop_visits as SELECT id, organization_id, route_id, guide_id, arrived_at, departed_at, dwell_seconds, arrival_distance_m, completed_at, created_at FROM tbl_tracking_stop_visits;
-- alter view public.tracking_stop_visits owner to olo_db; revoke all on public.tracking_stop_visits from tms_app;
-- grant insert, select, update, delete on public.tracking_stop_visits to tms_app;
-- ============================================================================

-- Validación (todo debe dar true)
select to_regclass('public.orders') is null                 as orders_ok,
       to_regclass('public.tracking_client_access') is null as client_access_ok,
       to_regclass('public.tracking_stop_visits') is null   as stop_visits_ok;
