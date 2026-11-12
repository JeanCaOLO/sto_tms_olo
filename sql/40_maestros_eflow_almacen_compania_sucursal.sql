-- ============================================================================
-- 40 — Maestros EFLOW, paso 1: almacén, compañía y sucursal.
--
-- Plan: docs/work/2026-10/2026-10-16-plan-modelo-pedidos-clientes-eflow.md
-- (paso 1). Decisiones en aidlc/spaces/default/memory/project.md (2026-10-16).
--
--   * warehouses (= EFLOW ALMACENES) y customers (= EFLOW COMPANIA) guardan el
--     código de EFLOW en `external_code`, con su instancia en `source_system`.
--     `code` NO se toca: scripts y migraciones buscan por 'EPA', 'COFERSA',
--     'OLO-CR'... La llave EFLOW es única POR INSTANCIA de EFLOW, no por país:
--     Venezuela tiene dos (EFLOW_FEBECA con Febeca 0001 / Sillaca 0002, y
--     EFLOW_BEVAL), así que el único es (source_system, external_code).
--   * branches (= EFLOW SUCURSAL): tabla nueva, única por (customer_id,
--     external_code). La sucursal cambia reglas de despacho/prioridad.
--
-- Códigos cargados SOLO donde hay evidencia:
--   * compañías 0029 = EPA y 0109 = Cofersa: datos reales del staging
--     wms_expediciones; Febeca 0001 / Sillaca 0002: sql/32.
--   * sucursales: las 8 de EPA (0001-0004) y Cofersa (0001-0004), con nombre y
--     datos completos del export de EFLOW SUCURSAL del 2026-10-16.
--   * Códigos de ALMACÉN (IDALMACEN) y de Beval: desconocidos -> NULL.
--
-- Nomenclatura: estándar OLTP INTELIX solo en las tablas tocadas (DECIDED
-- 2026-10-16): pk_/fk_/uq_/ck_/idx_/uidx_ + entidad en singular. Excepciones:
--   * el trigger de auditoría se llama audit_row_change en TODAS las tablas
--     porque sql/16 lo recrea por ese nombre; renombrarlo duplicaría la auditoría;
--   * customers_name_trgm (sql/39, equipo de tarifas) no se renombra: su
--     ROLLBACK lo referencia por nombre.
--
-- Uso:  node --env-file=.env scripts/run-migration.mjs sql/40_...sql            (dry-run)
--       node --env-file=.env scripts/run-migration.mjs sql/40_...sql --execute
-- Termina con una validación que aborta (y revierte) si falta algún objeto.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. warehouses (= EFLOW ALMACENES)
-- ---------------------------------------------------------------------------
alter table warehouses add column if not exists source_system text;
alter table warehouses add column if not exists external_code varchar(4);
comment on column warehouses.source_system is 'Instancia de EFLOW de donde viene el almacén: EFLOW_OLO (CR), EFLOW_FEBECA, EFLOW_BEVAL (VE).';
comment on column warehouses.external_code is 'EFLOW ALMACENES.IDALMACEN. Único por source_system.';

update warehouses w set source_system = m.source_system, updated_at = now()
from (values ('OLO-CR', 'EFLOW_OLO'), ('SAN-DIEGO', 'EFLOW_FEBECA'), ('MICHELENA', 'EFLOW_BEVAL')) as m(code, source_system)
where w.code = m.code and w.source_system is distinct from m.source_system;

-- OLO-VN (inactivo, sql/33) tenía la zona horaria de México.
update warehouses set timezone = 'America/Caracas', updated_at = now()
where code = 'OLO-VN' and timezone is distinct from 'America/Caracas';

alter table warehouses alter column timezone set not null;

create unique index if not exists uidx_warehouse_source_external_code
  on warehouses (source_system, external_code) where external_code is not null;

alter table warehouses rename constraint warehouses_pkey to pk_warehouse;
alter table warehouses rename constraint warehouses_country_id_fkey to fk_warehouse_country;
alter table warehouses rename constraint warehouses_organization_id_fkey to fk_warehouse_organization;
alter table warehouses rename constraint warehouses_country_id_code_key to uq_warehouse_country_code;

-- ROLLBACK 1 (ejecutar en orden descendente):
-- alter table warehouses rename constraint uq_warehouse_country_code to warehouses_country_id_code_key;
-- alter table warehouses rename constraint fk_warehouse_organization to warehouses_organization_id_fkey;
-- alter table warehouses rename constraint fk_warehouse_country to warehouses_country_id_fkey;
-- alter table warehouses rename constraint pk_warehouse to warehouses_pkey;
-- drop index if exists uidx_warehouse_source_external_code;
-- alter table warehouses alter column timezone drop not null;
-- alter table warehouses drop column if exists external_code;
-- alter table warehouses drop column if exists source_system;

-- ---------------------------------------------------------------------------
-- 2. customers (= EFLOW COMPANIA)
-- ---------------------------------------------------------------------------
alter table customers add column if not exists source_system text;
alter table customers add column if not exists external_code varchar(4);
comment on column customers.source_system is 'Instancia de EFLOW de donde viene la compañía: EFLOW_OLO (CR), EFLOW_FEBECA, EFLOW_BEVAL (VE).';
comment on column customers.external_code is 'EFLOW COMPANIA.IDCOMPANIA (ej. 0029 = EPA, 0109 = Cofersa). Único por source_system.';

update customers c set source_system = m.source_system, external_code = m.external_code, updated_at = now()
from (values ('EPA', 'EFLOW_OLO', '0029'), ('COFERSA', 'EFLOW_OLO', '0109'),
             ('FEBECA', 'EFLOW_FEBECA', '0001'), ('SILLACA', 'EFLOW_FEBECA', '0002'),
             ('BEVAL', 'EFLOW_BEVAL', null)) as m(code, source_system, external_code)
where c.code = m.code
  and (c.source_system is distinct from m.source_system or c.external_code is distinct from m.external_code);

create unique index if not exists uidx_customer_source_external_code
  on customers (source_system, external_code) where external_code is not null;

alter table customers rename constraint customers_pkey to pk_customer;
alter table customers rename constraint customers_country_id_fkey to fk_customer_country;
alter table customers rename constraint customers_organization_id_fkey to fk_customer_organization;
alter table customers rename constraint customers_warehouse_id_fkey to fk_customer_warehouse;
alter table customers rename constraint customers_organization_id_code_key to uq_customer_organization_code;
alter index customers_warehouse_id_code_key rename to uidx_customer_warehouse_code;
alter index idx_customers_country rename to idx_customer_country;
alter index idx_customers_org rename to idx_customer_organization;
alter index idx_customers_zone rename to idx_customer_delivery_zone;

-- ROLLBACK 2 (ejecutar en orden descendente):
-- alter index idx_customer_delivery_zone rename to idx_customers_zone;
-- alter index idx_customer_organization rename to idx_customers_org;
-- alter index idx_customer_country rename to idx_customers_country;
-- alter index uidx_customer_warehouse_code rename to customers_warehouse_id_code_key;
-- alter table customers rename constraint uq_customer_organization_code to customers_organization_id_code_key;
-- alter table customers rename constraint fk_customer_warehouse to customers_warehouse_id_fkey;
-- alter table customers rename constraint fk_customer_organization to customers_organization_id_fkey;
-- alter table customers rename constraint fk_customer_country to customers_country_id_fkey;
-- alter table customers rename constraint pk_customer to customers_pkey;
-- drop index if exists uidx_customer_source_external_code;
-- alter table customers drop column if exists external_code;
-- alter table customers drop column if exists source_system;

-- ---------------------------------------------------------------------------
-- 3. branches (= EFLOW SUCURSAL) — tabla nueva
-- ---------------------------------------------------------------------------
create table if not exists branches (
  id             uuid        not null default gen_random_uuid(),
  customer_id    uuid        not null,
  external_code  varchar(4)  not null,
  name           text        not null,
  short_name     text,
  branch_type    text,
  tax_id         text,
  erp_reference  text,
  country        text,
  province       text,
  city           text,
  address        text,
  email          text,
  phone          text,
  status         text        not null default 'active',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint pk_branch primary key (id),
  constraint fk_branch_customer foreign key (customer_id) references customers (id),
  constraint uq_branch_customer_external_code unique (customer_id, external_code),
  constraint ck_branch_status check (status in ('active', 'inactive'))
);

comment on table branches is 'Sucursales de cada compañía (EFLOW SUCURSAL, PK IDCOMPANIA+IDSUCURSAL). Cambian reglas de despacho/prioridad (sobrante, garantía, crossdock).';
comment on column branches.external_code is 'EFLOW SUCURSAL.IDSUCURSAL. Único por compañía.';
comment on column branches.name is 'EFLOW NOMBRELARGOSUCURSAL.';
comment on column branches.short_name is 'EFLOW NOMBRECORTOSUCURSAL.';
comment on column branches.branch_type is 'EFLOW TIPOSUCURSAL.';
comment on column branches.tax_id is 'EFLOW NUMEROIDENTIFICACION.';
comment on column branches.erp_reference is 'EFLOW IDREFERENCIAERP (cruce con Softland).';
comment on column branches.status is 'Derivado de EFLOW SITUACION.';

create index if not exists idx_branch_customer on branches (customer_id);

-- Sucursales reales: export de EFLOW_OLO.dbo.SUCURSAL (SUCURSAL_202610161101.csv,
-- 2026-10-16), compañías 0029 (EPA) y 0109 (Cofersa). Valores tal cual vienen de
-- EFLOW (incluida la dirección 'COSTA RICA' de EPA 0001). SITUACION 'DISP' -> 'active'.
insert into branches (customer_id, external_code, name, short_name, branch_type, tax_id, erp_reference,
                      country, province, city, address, email, phone, status)
select c.id, v.external_code, v.name, v.short_name, v.branch_type, v.tax_id, v.erp_reference,
       v.country, v.province, v.city, v.address, v.email, v.phone, v.status
from (values
  ('EPA', '0001', 'FERRETERIA EPA S.A.', 'FERRETERIA EPA S.A.', 'SUCURSAL', '0001', null, 'COSTA RICA', 'SAN JOSE', 'SAN JOSE', 'COSTA RICA', 'epacri@ologistics.com', '25881145', 'active'),
  ('EPA', '0002', 'FERRETERIA EPA- Venta Corporativa', 'EPA VC', 'SUCURSAL', 'EPA VC', null, 'COSTA RICA', 'SAN JOSE', 'SAN JOSE', 'COSTA RICA', 'epacri@ologistics.com', '25881145', 'active'),
  ('EPA', '0003', 'FERRETERIA EPA S.A SOBRANTE', null, 'SUCURSAL', '0003', null, 'COSTA RICA', 'ALAJUEJA', 'COYOL', 'OLO CLIRO', null, null, 'active'),
  ('EPA', '0004', 'CROSS NACIONAL', null, 'SUCURSAL', '004', '0004', 'Costa Rica', 'Alajuela', 'Alajuela', 'EPA Cross Nacional', null, null, 'active'),
  ('COFERSA', '0001', 'COFERSA', null, 'SUCURSAL', '0001', '0001', 'COSTA RICA', 'SAN JOSE', 'SANTA ANA', 'Pozos, Santa Ana', null, null, 'active'),
  ('COFERSA', '0002', 'COFERSA SOBRANTES', null, 'SUCURSAL', '0002', null, 'COSTA RICA', 'SAN JOSE', 'SANTA ANA', 'Pozos, Santa Ana', null, null, 'active'),
  ('COFERSA', '0003', 'COFERSA GARANTIAS', null, 'SUCURSAL', '0003', null, 'COSTA RICA', 'SAN JOSE', 'SANTA ANA', 'Pozos, Santa Ana', null, null, 'active'),
  ('COFERSA', '0004', 'CROSSDOCKING', null, 'SUCURSAL', '3101096760', null, 'Costa Rica', 'Alajuela', 'Alajuela', 'Centro logistico Cliro', null, null, 'active')
) as v(customer_code, external_code, name, short_name, branch_type, tax_id, erp_reference,
       country, province, city, address, email, phone, status)
join customers c on c.code = v.customer_code
on conflict (customer_id, external_code) do update set
  name = excluded.name, short_name = excluded.short_name, branch_type = excluded.branch_type,
  tax_id = excluded.tax_id, erp_reference = excluded.erp_reference, country = excluded.country,
  province = excluded.province, city = excluded.city, address = excluded.address,
  email = excluded.email, phone = excluded.phone, status = excluded.status, updated_at = now();

-- Auditoría (sql/16): registrar la tabla y crear su trigger con el nombre común.
insert into audit.tracked_tables (table_name, module_key, id_column, masked_columns)
values ('branches', 'clientes', 'id', '{}')
on conflict (table_name) do update set module_key = excluded.module_key;
drop trigger if exists audit_row_change on branches;
create trigger audit_row_change after insert or update or delete on branches
  for each row execute function audit.capture_row_change();

-- Permisos de la app (sql/18 ya da default privileges; explícito por claridad).
grant select, insert, update, delete on branches to tms_app;

-- ROLLBACK 3 (ejecutar en orden descendente):
-- delete from audit.tracked_tables where table_name = 'branches';
-- drop table if exists branches;

-- ---------------------------------------------------------------------------
-- 4. Validación: aborta la transacción si falta algún objeto.
-- ---------------------------------------------------------------------------
do $$
declare
  faltantes text[];
begin
  select array_agg(objeto) into faltantes
  from (values
      ('columna warehouses.source_system', exists (select 1 from information_schema.columns where table_name = 'warehouses' and column_name = 'source_system')),
      ('columna warehouses.external_code', exists (select 1 from information_schema.columns where table_name = 'warehouses' and column_name = 'external_code')),
      ('columna customers.source_system',  exists (select 1 from information_schema.columns where table_name = 'customers' and column_name = 'source_system')),
      ('columna customers.external_code',  exists (select 1 from information_schema.columns where table_name = 'customers' and column_name = 'external_code')),
      ('tabla branches',                   to_regclass('public.branches') is not null),
      ('pk_warehouse',                     exists (select 1 from pg_constraint where conname = 'pk_warehouse')),
      ('uq_warehouse_country_code',        exists (select 1 from pg_constraint where conname = 'uq_warehouse_country_code')),
      ('pk_customer',                      exists (select 1 from pg_constraint where conname = 'pk_customer')),
      ('fk_customer_warehouse',            exists (select 1 from pg_constraint where conname = 'fk_customer_warehouse')),
      ('uidx_customer_warehouse_code',     to_regclass('public.uidx_customer_warehouse_code') is not null),
      ('uidx_customer_source_external_code', to_regclass('public.uidx_customer_source_external_code') is not null),
      ('pk_branch',                        exists (select 1 from pg_constraint where conname = 'pk_branch')),
      ('fk_branch_customer',               exists (select 1 from pg_constraint where conname = 'fk_branch_customer')),
      ('trigger auditoría branches',       exists (select 1 from pg_trigger where tgname = 'audit_row_change' and tgrelid = 'public.branches'::regclass)),
      ('código EFLOW de EPA (0029)',       exists (select 1 from customers where code = 'EPA' and external_code = '0029')),
      ('código EFLOW de Cofersa (0109)',   exists (select 1 from customers where code = 'COFERSA' and external_code = '0109')),
      ('8 sucursales EPA/Cofersa',         (select count(*) from branches b join customers c on c.id = b.customer_id
                                            where c.code in ('EPA', 'COFERSA')) = 8),
      ('sin nombres PENDIENTE',            not exists (select 1 from branches where name like 'PENDIENTE%'))
    ) as v(objeto, ok)
  where not ok;

  if faltantes is not null then
    raise exception 'Validación sql/40: FALTA %', array_to_string(faltantes, ', ');
  end if;
  raise notice 'Validación sql/40: OK';
end $$;

commit;
