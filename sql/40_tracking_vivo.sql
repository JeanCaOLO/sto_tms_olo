-- ============================================================================
-- 40 — Tracking en vivo: puente Planificación → ejecución, posiciones GPS y evidencias.
--
--   routes.plan_trip_id        liga la ruta en ejecución con el viaje planificado que la originó
--                              (1 viaje planificado → 1 ruta; índice único = idempotencia del "iniciar").
--   tracking_positions         bitácora append-only de posiciones GPS (la escribe la app del chofer
--                              por lotes). `client_id` único = reintentos seguros. NO se audita:
--                              es de alto volumen y no es un dato de negocio editable.
--   tracking_last_positions    1 fila por ruta con la última posición (lo que lee el mapa). Tabla
--                              aparte para no disparar la auditoría de `routes` en cada lote.
--   tracking_evidences         evidencias de entrega en S3 (foto de factura firmada, firma digital,
--                              otra foto). Guarda la llave de S3, nunca una URL pública. Auditada.
--
-- Retención de tracking_positions: pendiente de definir (ver .test/tracking_nuevo/). Particionar por
-- mes cuando el volumen lo pida (blueprint 004).
-- Idempotente. Se aplica con scripts/run-migration.mjs (dry-run por defecto).
-- ============================================================================

begin;

-- 1) Puente con Planificación.
alter table routes add column if not exists plan_trip_id uuid references plan_trips(id);
create unique index if not exists ux_routes_plan_trip on routes (plan_trip_id) where plan_trip_id is not null;

-- 2) Posiciones GPS.
create table if not exists tracking_positions (
  id               bigint generated always as identity primary key,
  organization_id  uuid not null references organizations(id),
  route_id         uuid not null references routes(id),
  vehicle_id       uuid references vehicles(id),
  driver_id        uuid references drivers(id),
  device_id        text,
  client_id        uuid not null,
  latitude         numeric(10,8) not null check (latitude between -90 and 90),
  longitude        numeric(11,8) not null check (longitude between -180 and 180),
  accuracy_m       numeric,
  speed_mps        numeric check (speed_mps is null or (speed_mps >= 0 and speed_mps <= 90)),
  heading_deg      numeric check (heading_deg is null or (heading_deg >= 0 and heading_deg <= 360)),
  battery_pct      smallint check (battery_pct is null or (battery_pct between 0 and 100)),
  is_mock          boolean not null default false,
  recorded_at      timestamptz not null,
  received_at      timestamptz not null default now()
);
create unique index if not exists ux_tracking_positions_client on tracking_positions (client_id);
create index if not exists ix_tracking_positions_route_time on tracking_positions (route_id, recorded_at desc);
create index if not exists ix_tracking_positions_time on tracking_positions using brin (recorded_at);

-- 3) Última posición por ruta (lectura del mapa).
create table if not exists tracking_last_positions (
  route_id         uuid primary key references routes(id) on delete cascade,
  organization_id  uuid not null references organizations(id),
  latitude         numeric(10,8) not null,
  longitude        numeric(11,8) not null,
  speed_mps        numeric,
  heading_deg      numeric,
  battery_pct      smallint,
  recorded_at      timestamptz not null,
  updated_at       timestamptz not null default now()
);
create index if not exists ix_tracking_last_positions_org on tracking_last_positions (organization_id);

-- 4) Evidencias de entrega.
create table if not exists tracking_evidences (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references organizations(id),
  route_id           uuid not null references routes(id),
  dispatch_guide_id  uuid not null references dispatch_guides(id),
  kind               text not null check (kind in ('photo_invoice', 'signature', 'photo_other')),
  storage_key        text not null,
  mime_type          text not null,
  size_bytes         integer,
  captured_at        timestamptz,
  latitude           numeric(10,8),
  longitude          numeric(11,8),
  client_id          uuid,
  created_by         uuid,
  created_at         timestamptz not null default now()
);
create unique index if not exists ux_tracking_evidences_client on tracking_evidences (client_id) where client_id is not null;
create unique index if not exists ux_tracking_evidences_key on tracking_evidences (storage_key);
create index if not exists ix_tracking_evidences_guide on tracking_evidences (dispatch_guide_id);
create index if not exists ix_tracking_evidences_route on tracking_evidences (route_id);

-- 5) Auditoría solo de las evidencias (no de las posiciones).
insert into audit.tracked_tables (table_name, module_key, id_column, masked_columns) values
  ('tracking_evidences', 'tracking', 'id', '{}')
on conflict (table_name) do update
  set module_key = excluded.module_key, id_column = excluded.id_column, masked_columns = excluded.masked_columns;

drop trigger if exists audit_row_change on public.tracking_evidences;
create trigger audit_row_change after insert or update or delete on public.tracking_evidences
  for each row execute function audit.capture_row_change();

commit;
