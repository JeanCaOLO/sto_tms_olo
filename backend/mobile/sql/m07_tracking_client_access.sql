-- ============================================================================
-- m07 — Tracking: acceso del rol Cliente a SU entrega. BD COMPARTIDA con el TMS (aditivo e idempotente).
--
--   tracking_client_access   qué punto de entrega (o cliente destino, si no hay punto) ve cada usuario con rol
--                            `Cliente` en el módulo Tracking. El rol y su permiso `tracking:view` ya existen
--                            (sql/15); lo que faltaba es el vínculo usuario → punto, porque `user_scopes` solo llega a
--                            la compañía. Sin fila, el cliente no ve nada. Se carga por SQL por ahora, por ejemplo:
--
--     insert into tracking_client_access (organization_id, app_user_id, delivery_point_id)
--     select u.organization_id, u.id, dp.id from app_users u, delivery_points dp
--     where u.email = 'cliente@tienda.com' and dp.name = 'EPA Escazú';
--
-- Se aplica con `python scripts/migrate.py sql/m07_tracking_client_access.sql` (dry-run por defecto; --execute aplica).
--
-- ROLLBACK: drop table if exists tracking_client_access;
-- ============================================================================

begin;

create table if not exists tracking_client_access (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references organizations(id),
  app_user_id        uuid not null references app_users(id) on delete cascade,
  delivery_point_id  uuid references delivery_points(id) on delete cascade,
  final_customer_id  uuid references final_customers(id) on delete cascade,
  created_at         timestamptz not null default now(),
  constraint ck_tracking_client_access_target check (delivery_point_id is not null or final_customer_id is not null)
);
create unique index if not exists uidx_tracking_client_access_point
  on tracking_client_access (app_user_id, delivery_point_id) where delivery_point_id is not null;
create unique index if not exists uidx_tracking_client_access_customer
  on tracking_client_access (app_user_id, final_customer_id) where final_customer_id is not null;

commit;
