-- ============================================================================
-- m06 — Tracking: tiempo en cada parada. BD COMPARTIDA con el TMS (aditivo e idempotente).
--
--   tracking_stop_visits   una fila por parada (dispatch_guides) con la hora en que el camión entró al radio de
--                          150 m (`arrived_at`), la hora en que salió (> 200 m, `departed_at`) y la permanencia
--                          (`dwell_seconds`). Lo escribe el servidor al ingerir las posiciones del chofer, con la
--                          hora de CADA posición (no la del envío), así que un lote tardío o de la cola offline da
--                          tiempos correctos. `completed_at` es el momento en que el chofer registró la entrega o el
--                          fallo, para separar «tiempo en el sitio» de «tiempo hasta cerrar la parada».
--
-- Se aplica con `python scripts/migrate.py sql/m06_stop_visits.sql` (dry-run por defecto; --execute aplica).
--
-- ROLLBACK: drop table if exists tracking_stop_visits;
-- ============================================================================

begin;

create table if not exists tracking_stop_visits (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references organizations(id),
  route_id            uuid not null references routes(id) on delete cascade,
  guide_id            uuid not null references dispatch_guides(id) on delete cascade,
  arrived_at          timestamptz not null,
  departed_at         timestamptz,
  dwell_seconds       integer check (dwell_seconds is null or dwell_seconds >= 0),
  arrival_distance_m  integer check (arrival_distance_m is null or arrival_distance_m >= 0),
  completed_at        timestamptz,
  created_at          timestamptz not null default now(),
  constraint ck_tracking_stop_visit_order check (departed_at is null or departed_at >= arrived_at)
);
create unique index if not exists uidx_tracking_stop_visit_guide on tracking_stop_visits (guide_id);
create index if not exists idx_tracking_stop_visit_route on tracking_stop_visits (route_id);

commit;
