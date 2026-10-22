-- ============================================================================
-- 45 — Tracking: presencia del chofer (online/offline) y eventos idempotentes de la app móvil.
--
--   driver_presence               una fila por conductor: online/offline explícito (login, logout, latido de la app
--                                 o posición) y la última vez que se supo de él. Tracking la lee para la señal del
--                                 viaje (un logout explícito manda sobre la antigüedad del último punto) y para
--                                 listar choferes en línea sin viaje (GET /tracking/choferes).
--   tracking_events.client_id     id generado en el teléfono: reenviar una novedad o transición desde la cola
--                                 offline no duplica el evento. NULL para los eventos que no vienen de la app.
--
-- Equivale a `mobile/backend/sql/m03_driver_presence.sql` (la app móvil la aplica con su runner): si ya está
-- aplicada, no hace nada. DEBE aplicarse ANTES de desplegar el stack tracking: la lista de viajes la une.
-- Idempotente. Se aplica con scripts/run-migration.mjs (dry-run por defecto).
-- ============================================================================

begin;

create table if not exists driver_presence (
  driver_id        uuid primary key references drivers(id) on delete cascade,
  organization_id  uuid not null references organizations(id),
  status           text not null check (status in ('online', 'offline')),
  last_event       text not null check (last_event in ('login', 'logout', 'heartbeat', 'position')),
  last_seen_at     timestamptz not null,
  device_id        text,
  battery_pct      smallint check (battery_pct is null or battery_pct between 0 and 100),
  updated_at       timestamptz not null default now()
);
create index if not exists ix_driver_presence_org on driver_presence (organization_id, status);

alter table tracking_events add column if not exists client_id uuid;
create unique index if not exists ux_tracking_events_client on tracking_events (client_id) where client_id is not null;

commit;
