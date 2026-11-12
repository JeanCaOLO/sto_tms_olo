-- ============================================================================
-- m01 — App móvil del chofer: base. BD COMPARTIDA con el TMS (aditivo e idempotente).
--
--   drivers.app_user_id          enlaza cada conductor con SU usuario (rol Chofer) de la app. Un usuario solo puede
--                                ser un conductor (índice único parcial). Equivale a sql/41 del TMS: si ya está
--                                aplicada, no hace nada.
--   tracking_events.distance_m   metros entre el dispositivo y el punto de entrega al cerrar la parada (auditoría de
--                                la geocerca de 150 m; NULL si no hubo ubicación o la parada no tiene coordenadas).
--   tracking_consents            consentimiento GPS del chofer: una fila por usuario y versión del aviso.
--   mobile_refresh_tokens        sesiones de la app (refresh token con rotación). Solo guarda el HASH del token.
--
-- Requisitos previos (del TMS, ya aplicados en el sandbox): sql/40_tracking_vivo.sql (tracking_positions,
-- tracking_last_positions, tracking_evidences, routes.plan_trip_id). No toca role_permissions: la app autoriza por
-- rol Chofer + conductor enlazado, no por la matriz del TMS.
--
-- Se aplica con `python scripts/migrate.py sql/m01_mobile_base.sql` (dry-run por defecto; --execute aplica).
-- ============================================================================

begin;

alter table drivers add column if not exists app_user_id uuid references app_users(id);
create unique index if not exists ux_drivers_app_user on drivers (app_user_id) where app_user_id is not null;

alter table tracking_events add column if not exists distance_m integer
  check (distance_m is null or distance_m >= 0);

create table if not exists tracking_consents (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id),
  app_user_id      uuid not null references app_users(id),
  version          text not null,
  consented_at     timestamptz not null default now(),
  device_id        text,
  unique (app_user_id, version)
);
create index if not exists ix_tracking_consents_org on tracking_consents (organization_id);

create table if not exists mobile_refresh_tokens (
  id           uuid primary key default gen_random_uuid(),
  app_user_id  uuid not null references app_users(id) on delete cascade,
  token_hash   text not null unique,
  device_id    text,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  revoked_at   timestamptz
);
create index if not exists ix_mobile_refresh_user on mobile_refresh_tokens (app_user_id) where revoked_at is null;

commit;
