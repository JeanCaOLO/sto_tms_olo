-- ============================================================================
-- 43 — Tracking: soporte de la app móvil del chofer.
--
--   tracking_events.distance_m   metros entre el dispositivo y el punto de entrega al cerrar la parada
--                                (auditoría de la geocerca de 150 m; NULL si la app no envió ubicación o
--                                la parada no tiene coordenadas).
--   Rol Chofer                   pasa de `tracking:view` a view + create + edit. El backend lo restringe a
--                                SUS viajes (routes.driver_id = drivers.app_user_id, sql/41) y le niega la
--                                lista general, los KPIs, iniciar, completar y revisar viajes.
--
--   tracking_consents            consentimiento del chofer para compartir su ubicación (brecha B6): una fila por
--                                usuario y versión del aviso; la app la registra al aceptar la pantalla de aviso.
--
-- Requiere sql/41 aplicada. Idempotente. Se aplica con scripts/run-migration.mjs (dry-run por defecto).
-- ============================================================================

begin;

alter table tracking_events add column if not exists distance_m integer check (distance_m is null or distance_m >= 0);

insert into role_permissions (role_id, module_key, action)
select r.id, 'tracking', a.action
from roles r
cross join (values ('view'), ('create'), ('edit')) a(action)
where r.name = 'Chofer'
on conflict do nothing;

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

commit;
