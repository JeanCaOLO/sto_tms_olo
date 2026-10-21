-- ============================================================================
-- 41 — Tracking: vínculo conductor ↔ usuario de la app móvil.
--
--   drivers.app_user_id   cada conductor puede tener UN usuario (rol Chofer) con el que inicia
--                         sesión en la app; un usuario solo puede ser un conductor (índice único
--                         parcial). La web NO restringe por este vínculo (el admin ve todos los
--                         viajes); lo usará el endpoint `mi-viaje` de la app móvil.
--
-- Idempotente. Se aplica con scripts/run-migration.mjs (dry-run por defecto).
-- ============================================================================

begin;

alter table drivers add column if not exists app_user_id uuid references app_users(id);
create unique index if not exists ux_drivers_app_user on drivers (app_user_id) where app_user_id is not null;

commit;
