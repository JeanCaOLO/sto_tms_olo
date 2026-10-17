-- ============================================================================
-- 44 — Tracking: rendimiento de la lista de viajes y del replay (monitoreo v2).
--
--   routes.departed_at            primera salida de la sede (> 300 m). La fija la ingesta de posiciones
--                                 una sola vez; el detalle la lee sin escanear posiciones.
--   ix_routes_status_lower        filtro de viajes activos/completados (lower(status) = ANY(...)).
--   ix_routes_org_sort            orden y cursor de la lista: (organización, inicio o creación, id).
--   trigramas (pg_trgm)           búsqueda "q" (ILIKE %texto%) por número de viaje, placa y nombre del conductor.
--   ix_tracking_events_route_time línea de tiempo de eventos por viaje.
--
-- No se backfillea departed_at: los viajes anteriores conservan la detección por posición.
-- Idempotente. Se aplica con scripts/run-migration.mjs (dry-run por defecto).
-- ============================================================================

begin;

alter table routes add column if not exists departed_at timestamptz;

create index if not exists ix_routes_status_lower on routes (lower(status));
create index if not exists ix_routes_org_sort on routes (organization_id, (coalesce(actual_start_time, created_at)) desc, id desc);

create extension if not exists pg_trgm;
create index if not exists ix_routes_route_number_trgm on routes using gin (route_number gin_trgm_ops);
create index if not exists ix_vehicles_plate_trgm on vehicles using gin (plate gin_trgm_ops);
create index if not exists ix_drivers_full_name_trgm on drivers using gin (full_name gin_trgm_ops);

create index if not exists ix_tracking_events_route_time on tracking_events (route_id, event_time desc);

commit;
