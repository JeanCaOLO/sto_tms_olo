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
-- Convención de la BD (igual que tbl_driver_presence / tbl_tracking_events): la tabla real es
-- `tbl_tracking_client_access` y `tracking_client_access` es una vista simple encima, que es lo que usa el código.
-- Las FK apuntan a las tablas reales (`tbl_*`): en esta BD `organizations`, `app_users`, etc. son vistas.
--
-- Se aplica con `python scripts/migrate.py sql/m07_tracking_client_access.sql` (dry-run por defecto; --execute aplica).
--
-- ROLLBACK:
--   drop view if exists tracking_client_access;
--   drop table if exists tbl_tracking_client_access;
-- ============================================================================

begin;

create table if not exists tbl_tracking_client_access (
  id                 uuid not null default gen_random_uuid(),
  organization_id    uuid not null,
  app_user_id        uuid not null,
  delivery_point_id  uuid,
  final_customer_id  uuid,
  created_at         timestamptz not null default now(),
  constraint pk_tracking_client_access primary key (id),
  constraint fk_tracking_client_access_organization_id foreign key (organization_id) references tbl_organizations (id),
  constraint fk_tracking_client_access_app_user_id foreign key (app_user_id) references tbl_app_users (id) on delete cascade,
  constraint fk_tracking_client_access_delivery_point_id foreign key (delivery_point_id) references tbl_delivery_points (id) on delete cascade,
  constraint fk_tracking_client_access_final_customer_id foreign key (final_customer_id) references tbl_final_customers (id) on delete cascade,
  constraint ck_tracking_client_access_target check (delivery_point_id is not null or final_customer_id is not null)
);
create unique index if not exists uidx_tracking_client_access_point
  on tbl_tracking_client_access (app_user_id, delivery_point_id) where delivery_point_id is not null;
create unique index if not exists uidx_tracking_client_access_customer
  on tbl_tracking_client_access (app_user_id, final_customer_id) where final_customer_id is not null;

create or replace view tracking_client_access as
  select id, organization_id, app_user_id, delivery_point_id, final_customer_id, created_at
  from tbl_tracking_client_access;

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'tms_app') then
    grant select, insert, update, delete on tbl_tracking_client_access to tms_app;
    grant select, insert, update, delete on tracking_client_access to tms_app;
  end if;
end $$;

commit;
