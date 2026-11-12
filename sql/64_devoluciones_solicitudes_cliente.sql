-- ============================================================================
-- 64 — Devoluciones: solicitudes de devolución creadas por el CLIENTE + rol "Cliente".
--
--   tbl_app_users.customer_id        empresa (tbl_customers) a la que pertenece el usuario con rol Cliente
--   tbl_return_requests              solicitud: número SOL-AAAA-MM-####, estado pendiente_asignacion
--   tbl_return_request_items         artículos: código, cantidad, motivo predefinido, descripción breve
--   tbl_return_request_files         fotos / videos de cada artículo (llave S3)
--   tbl_app_modules                  módulo `devoluciones_solicitud` (/mis-devoluciones)
--   tbl_roles / tbl_role_permissions rol 'Cliente' con view + create sobre ese módulo
--
-- 100 % aditiva. NO toca tbl_returns ni el bloqueo de liquidación: lo que pasa con una solicitud después de
-- creada (quién la atiende) aún no está definido -> .test/devoluciones/pendientes-solicitudes-cliente.md
--
-- Aplicar con: node --env-file=.env.local scripts/run-migration.mjs sql/64_devoluciones_solicitudes_cliente.sql [--execute]
-- Deshacer con: sql/64_devoluciones_solicitudes_cliente_rollback.sql
-- Idempotente.
-- ============================================================================

begin;

-- 1. Usuario -> empresa -------------------------------------------------------
alter table tbl_app_users add column if not exists customer_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'fk_app_user_customer') then
    alter table tbl_app_users
      add constraint fk_app_user_customer foreign key (customer_id) references tbl_customers (id) on delete set null;
  end if;
end $$;

create index if not exists idx_app_user_customer on tbl_app_users (customer_id) where customer_id is not null;

-- 2. Solicitudes --------------------------------------------------------------
create table if not exists tbl_return_requests (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  customer_id     uuid not null,
  requested_by    uuid not null,
  request_number  varchar(30) not null,
  status          varchar(30) not null default 'pendiente_asignacion',
  created_at      timestamptz not null default now(),
  constraint fk_return_request_customer foreign key (customer_id) references tbl_customers (id),
  constraint fk_return_request_user foreign key (requested_by) references tbl_app_users (id),
  constraint uq_return_request_number unique (organization_id, request_number),
  constraint ck_return_request_status check (status in ('pendiente_asignacion'))
);
create index if not exists idx_return_request_customer on tbl_return_requests (customer_id, created_at desc);

create table if not exists tbl_return_request_items (
  id            uuid primary key default gen_random_uuid(),
  request_id    uuid not null,
  line_number   integer not null,
  product_code  varchar(100) not null,
  product_name  varchar(255),
  quantity      integer not null,
  reason_code   varchar(30) not null,
  description   varchar(500),
  constraint fk_return_request_item_request foreign key (request_id) references tbl_return_requests (id) on delete cascade,
  constraint uq_return_request_item_line unique (request_id, line_number),
  constraint ck_return_request_item_quantity check (quantity > 0),
  constraint ck_return_request_item_reason
    check (reason_code in ('no_solicitado', 'danado', 'cantidad_de_mas', 'rechazado', 'otro')),
  constraint ck_return_request_item_other_desc
    check (reason_code <> 'otro' or length(btrim(coalesce(description, ''))) > 0)
);

create table if not exists tbl_return_request_files (
  id          uuid primary key default gen_random_uuid(),
  item_id     uuid not null,
  s3_key      varchar(500) not null,
  kind        varchar(10) not null,
  mime_type   varchar(50) not null,
  size_bytes  bigint not null,
  created_at  timestamptz not null default now(),
  constraint fk_return_request_file_item foreign key (item_id) references tbl_return_request_items (id) on delete cascade,
  constraint uq_return_request_file_key unique (s3_key),
  constraint ck_return_request_file_kind check (kind in ('photo', 'video'))
);
create index if not exists idx_return_request_file_item on tbl_return_request_files (item_id);

-- 3. Módulo y rol "Cliente" ----------------------------------------------------
insert into tbl_app_modules (key, group_key, path, sort_order)
values ('devoluciones_solicitud', null, '/mis-devoluciones', 31)
on conflict (key) do update
  set group_key = excluded.group_key, path = excluded.path, sort_order = excluded.sort_order;

insert into tbl_roles (name, description)
select 'Cliente', 'Cliente externo: solicita por sí mismo la devolución de mercadería'
 where not exists (select 1 from tbl_roles r where lower(r.name) = 'cliente');

insert into tbl_role_permissions (role_id, module_key, action)
select r.id, 'devoluciones_solicitud', a.action
  from tbl_roles r
 cross join (values ('view'), ('create')) as a(action)
 where lower(r.name) = 'cliente'
   and not exists (
     select 1 from tbl_role_permissions p
      where p.role_id = r.id and p.module_key = 'devoluciones_solicitud' and p.action = a.action);

-- El rol Cliente ya podía existir con los permisos de arranque de sql/15 (pedidos + tracking). Este rol solo debe ver
-- su pantalla de solicitud: se quitan esos extras SOLO si todavía no hay ningún usuario con el rol (no se pisa nada en uso).
delete from tbl_role_permissions p
 using tbl_roles r
 where p.role_id = r.id and lower(r.name) = 'cliente' and p.module_key <> 'devoluciones_solicitud'
   and not exists (select 1 from tbl_app_users u where u.role_id = r.id);

-- 4. Permisos de la aplicación -------------------------------------------------
do $$
declare
  t text;
begin
  if exists (select 1 from pg_roles where rolname = 'tms_app') then
    foreach t in array array['tbl_return_requests', 'tbl_return_request_items', 'tbl_return_request_files'] loop
      execute format('grant select, insert, update, delete on public.%I to tms_app', t);
    end loop;
  else
    raise notice 'tms_app no existe: se omiten los GRANT (correr sql/18 primero)';
  end if;
end $$;

commit;
