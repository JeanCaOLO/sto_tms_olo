-- ============================================================================
-- 63_restaurar_vistas_tracking.sql — restaura las 2 vistas de tracking que la sql/62
-- borró por error. No eran vistas de compatibilidad de la sql/59: son de tablas nuevas de
-- tracking (rama de José). Se recrean con la definición, el dueño y los GRANT que tenían
-- el 2026-11-05.
--
-- Estándar OLTP INTELIX (sql/README.md). Aurora PostgreSQL. Idempotente.
-- ============================================================================

create or replace view public.tracking_client_access as
  select id, organization_id, app_user_id, delivery_point_id, final_customer_id, created_at
  from public.tbl_tracking_client_access;
alter view public.tracking_client_access owner to olo_db;
revoke all on public.tracking_client_access from tms_app;
grant insert, select, update, delete on public.tracking_client_access to tms_app;

create or replace view public.tracking_stop_visits as
  select id, organization_id, route_id, guide_id, arrived_at, departed_at, dwell_seconds, arrival_distance_m,
         completed_at, created_at
  from public.tbl_tracking_stop_visits;
alter view public.tracking_stop_visits owner to olo_db;
revoke all on public.tracking_stop_visits from tms_app;
grant insert, select, update, delete on public.tracking_stop_visits to tms_app;

-- ============================================================================
-- ROLLBACK (descomentar y ejecutar)
-- ----------------------------------------------------------------------------
-- drop view if exists public.tracking_client_access;
-- drop view if exists public.tracking_stop_visits;
-- ============================================================================

-- Validación (todo debe dar true)
select to_regclass('public.tracking_client_access') is not null as client_access_ok,
       to_regclass('public.tracking_stop_visits') is not null   as stop_visits_ok,
       has_table_privilege('tms_app', 'public.tracking_stop_visits', 'insert') as grant_ok;
