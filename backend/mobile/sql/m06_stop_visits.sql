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
-- Convención de la BD (igual que tbl_driver_presence / tbl_tracking_events): la tabla real es `tbl_tracking_stop_visits`
-- y `tracking_stop_visits` es una vista simple encima, que es lo que usa el código. Las FK apuntan a las tablas
-- reales (`tbl_*`): en esta BD `organizations`, `routes`, etc. son vistas y no se pueden referenciar.
--
-- Se aplica con `python scripts/migrate.py sql/m06_stop_visits.sql` (dry-run por defecto; --execute aplica).
--
-- ROLLBACK:
--   drop view if exists tracking_stop_visits;
--   drop table if exists tbl_tracking_stop_visits;
-- ============================================================================

begin;

create table if not exists tbl_tracking_stop_visits (
  id                  uuid not null default gen_random_uuid(),
  organization_id     uuid not null,
  route_id            uuid not null,
  guide_id            uuid not null,
  arrived_at          timestamptz not null,
  departed_at         timestamptz,
  dwell_seconds       integer,
  arrival_distance_m  integer,
  completed_at        timestamptz,
  created_at          timestamptz not null default now(),
  constraint pk_tracking_stop_visits primary key (id),
  constraint fk_tracking_stop_visits_organization_id foreign key (organization_id) references tbl_organizations (id),
  constraint fk_tracking_stop_visits_route_id foreign key (route_id) references tbl_routes (id) on delete cascade,
  constraint fk_tracking_stop_visits_guide_id foreign key (guide_id) references tbl_dispatch_guides (id) on delete cascade,
  constraint ck_tracking_stop_visits_dwell check (dwell_seconds is null or dwell_seconds >= 0),
  constraint ck_tracking_stop_visits_distance check (arrival_distance_m is null or arrival_distance_m >= 0),
  constraint ck_tracking_stop_visits_order check (departed_at is null or departed_at >= arrived_at)
);
create unique index if not exists uidx_tracking_stop_visits_guide_id on tbl_tracking_stop_visits (guide_id);
create index if not exists idx_tracking_stop_visits_route_id on tbl_tracking_stop_visits (route_id);

create or replace view tracking_stop_visits as
  select id, organization_id, route_id, guide_id, arrived_at, departed_at, dwell_seconds, arrival_distance_m,
         completed_at, created_at
  from tbl_tracking_stop_visits;

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'tms_app') then
    grant select, insert, update, delete on tbl_tracking_stop_visits to tms_app;
    grant select, insert, update, delete on tracking_stop_visits to tms_app;
  end if;
end $$;

commit;
