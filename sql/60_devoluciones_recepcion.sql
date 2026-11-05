-- ============================================================================
-- 60 — Devoluciones: recepción por viaje + formulario por viaje + rol "Devoluciones".
--
--   tbl_returns                 + received_at / received_by / received_quantity / received_condition
--                               + ck_return_status (pending|approved|received|rejected|cancelled)
--   tbl_return_forms            UN formulario por viaje (ruta): número DEV-AAAA-MM-#### y campos manuales
--   tbl_return_form_sections    una sección por parada (cliente / factura) dentro del formulario
--   vw_return_trips             viajes con devoluciones y sus conteos (total / recibidas / pendientes)
--   tbl_roles                   rol 'Devoluciones' (solo ve/edita/exporta el módulo `devoluciones`)
--
-- 100 % aditiva: no modifica ni borra nada existente (vw_tarifas_devoluciones y sus consumidores intactos).
-- Estado "received" = la bodega recibió la mercadería devuelta. Un viaje con devoluciones sin recibir no
-- debe liquidarse (lo hace cumplir backend/tarifas detrás del flag TMS_RETURNS_GATE).
--
-- Aplicar con: node --env-file=.env.local scripts/run-migration.mjs sql/60_devoluciones_recepcion.sql [--execute]
-- Deshacer con: sql/60_devoluciones_recepcion_rollback.sql
-- Idempotente.
-- ============================================================================

begin;

-- 1. Recepción en tbl_returns ------------------------------------------------
alter table tbl_returns add column if not exists received_at timestamptz;
alter table tbl_returns add column if not exists received_by uuid;
alter table tbl_returns add column if not exists received_quantity integer;
alter table tbl_returns add column if not exists received_condition varchar(50);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'fk_return_received_by') then
    alter table tbl_returns
      add constraint fk_return_received_by foreign key (received_by) references tbl_app_users (id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ck_return_status') then
    alter table tbl_returns
      add constraint ck_return_status check (status in ('pending', 'approved', 'received', 'rejected', 'cancelled')) not valid;
    alter table tbl_returns validate constraint ck_return_status;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ck_return_received_quantity') then
    alter table tbl_returns
      add constraint ck_return_received_quantity check (received_quantity is null or received_quantity >= 0);
  end if;
end $$;

create index if not exists idx_return_dispatch_guide_status on tbl_returns (dispatch_guide_id, status);

-- 2. Formulario por viaje -----------------------------------------------------
create table if not exists tbl_return_forms (
  id                      uuid primary key default gen_random_uuid(),
  organization_id         uuid not null,
  route_id                uuid not null,
  form_number             varchar(30) not null,
  physical_receipt_number varchar(50),
  branch                  varchar(100),
  return_kind             varchar(20) not null default 'devolucion',
  merchandise_for         varchar(255),
  observations            text,
  transport               varchar(255),
  guide_number            varchar(100),
  comments                text,
  received_by_name        varchar(255),
  received_date           date,
  created_by              uuid,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint fk_return_form_organization foreign key (organization_id) references tbl_organizations (id) on delete cascade,
  constraint fk_return_form_route foreign key (route_id) references tbl_routes (id) on delete cascade,
  constraint fk_return_form_created_by foreign key (created_by) references tbl_app_users (id) on delete set null,
  constraint uq_return_form_route unique (route_id),
  constraint uq_return_form_number unique (organization_id, form_number),
  constraint ck_return_form_kind check (return_kind in ('devolucion', 'reparacion', 'cambio'))
);

create table if not exists tbl_return_form_sections (
  id                uuid primary key default gen_random_uuid(),
  form_id           uuid not null,
  dispatch_guide_id uuid,
  sort_order        integer not null default 0,
  invoice_number    varchar(100),
  customer_code     varchar(100),
  customer_name     varchar(255),
  phone             varchar(50),
  address           text,
  route_label       varchar(100),
  sellers           text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint fk_return_form_section_form foreign key (form_id) references tbl_return_forms (id) on delete cascade,
  constraint fk_return_form_section_guide foreign key (dispatch_guide_id) references tbl_dispatch_guides (id) on delete set null,
  constraint uq_return_form_section_guide unique (form_id, dispatch_guide_id)
);
create index if not exists idx_return_form_section_form on tbl_return_form_sections (form_id, sort_order);

-- 3. Viajes con devoluciones ---------------------------------------------------
create or replace view vw_return_trips as
select r.id                                   as route_id,
       r.organization_id,
       r.route_number,
       r.route_date,
       r.plan_trip_id,
       r.status                               as route_status,
       r.driver_id,
       d.full_name                            as driver_name,
       r.carrier_id,
       c.name                                 as carrier_name,
       s.country_id,
       count(rt.id)::int                      as total_returns,
       (count(rt.id) filter (where rt.status = 'received'))::int as received_returns,
       (count(rt.id) filter (where coalesce(rt.status, 'pending') not in ('received', 'rejected', 'cancelled')))::int as pending_returns,
       max(rt.return_date)                    as last_return_at,
       f.id                                   as form_id,
       f.form_number
  from tbl_routes r
  join tbl_stores s on s.id = r.store_id
  join tbl_dispatch_guides g on g.route_id = r.id
  join tbl_returns rt on rt.dispatch_guide_id = g.id
  left join tbl_drivers d on d.id = r.driver_id
  left join tbl_carriers c on c.id = r.carrier_id
  left join tbl_return_forms f on f.route_id = r.id
 group by r.id, r.organization_id, r.route_number, r.route_date, r.plan_trip_id, r.status, r.driver_id,
          d.full_name, r.carrier_id, c.name, s.country_id, f.id, f.form_number;

-- 4. Rol "Devoluciones" -----------------------------------------------------------
insert into tbl_roles (name, description)
select 'Devoluciones', 'Bodega de devoluciones: recibe la mercadería devuelta por viaje y llena el formulario'
 where not exists (select 1 from tbl_roles r where lower(r.name) = 'devoluciones');

insert into tbl_role_permissions (role_id, module_key, action)
select r.id, 'devoluciones', a.action
  from tbl_roles r
 cross join (values ('view'), ('edit'), ('export')) as a(action)
 where lower(r.name) = 'devoluciones'
   and not exists (
     select 1 from tbl_role_permissions p
      where p.role_id = r.id and p.module_key = 'devoluciones' and p.action = a.action);

-- 5. Permisos de la aplicación (mismo patrón que sql/46) ------------------------------
do $$
declare
  t text;
begin
  if exists (select 1 from pg_roles where rolname = 'tms_app') then
    foreach t in array array['tbl_return_forms', 'tbl_return_form_sections'] loop
      execute format('grant select, insert, update, delete on public.%I to tms_app', t);
    end loop;
    grant select on public.vw_return_trips to tms_app;
  else
    raise notice 'tms_app no existe: se omiten los GRANT (correr sql/18 primero)';
  end if;
end $$;

commit;
