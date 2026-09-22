-- ============================================================================
-- FASE 1 — Multi-country Foundation
-- Ver docs/arquitectura-tms-oms/{02-to-be,03-modelo-datos-erd,04-matriz-migracion,
-- 05-roadmap,08-db-gap-analysis}.md para el diseño completo y su justificación.
--
-- Principio de esta migración (04-matriz-migracion.md §2): NUNCA destructiva.
-- Toda columna nueva es NULLABLE con backfill inmediato en la misma
-- transacción; ninguna tabla existente se elimina ni pierde columnas;
-- `license_types` se RENOMBRA (no se recrea) para preservar sus filas e IDs.
--
-- Ejecutar con scripts/run-migration.mjs (dry-run por defecto; --execute para
-- aplicar). NO ejecutar directamente contra producción sin ese runner: es el
-- único que registra la migración en schema_migrations.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. countries — atributos multi-país (§5 del prompt de implementación)
-- ---------------------------------------------------------------------------
alter table countries
  add column if not exists timezone text,
  add column if not exists locale text,
  add column if not exists unit_system text,
  add column if not exists date_format text;

update countries set
  timezone = coalesce(timezone, case code when 'CR' then 'America/Costa_Rica' when 'VN' then 'America/Caracas' else timezone end),
  locale = coalesce(locale, 'es'),
  unit_system = coalesce(unit_system, 'metric'),
  date_format = coalesce(date_format, 'DD/MM/YYYY');

-- ---------------------------------------------------------------------------
-- 2. warehouses — nivel nuevo entre país y cliente (ADR-002)
-- ---------------------------------------------------------------------------
create table if not exists warehouses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  country_id uuid not null references countries(id),
  code text not null,
  name text not null,
  timezone text,
  currency_id text,
  address text,
  latitude numeric,
  longitude numeric,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (country_id, code)
);

-- Backfill: un warehouse por país ya existente ("OLO <País>"), para que todo
-- lo que hoy cuelga de country_id tenga un warehouse al que apuntar.
insert into warehouses (organization_id, country_id, code, name, timezone)
select c.organization_id, c.id, 'OLO-' || c.code, 'OLO ' || c.name, c.timezone
from countries c
where not exists (select 1 from warehouses w where w.country_id = c.id);

-- ---------------------------------------------------------------------------
-- 3. customers / stores — re-scope a warehouse_id (aditivo; el scope viejo
--    por organization_id sigue funcionando, ver 04-matriz-migracion.md)
-- ---------------------------------------------------------------------------
alter table customers add column if not exists warehouse_id uuid references warehouses(id);
update customers cu
  set warehouse_id = w.id
  from warehouses w
  where cu.warehouse_id is null and w.country_id = cu.country_id;
create unique index if not exists customers_warehouse_id_code_key on customers (warehouse_id, code);

alter table stores add column if not exists warehouse_id uuid references warehouses(id);
alter table stores add column if not exists is_origin boolean;
update stores st
  set warehouse_id = w.id
  from warehouses w
  where st.warehouse_id is null and w.country_id = st.country_id;
update stores set is_origin = coalesce(is_origin, true); -- ver 08-db-gap-analysis.md: hoy TODO stores es origen

-- ---------------------------------------------------------------------------
-- 4. addresses — dirección física + geo, separada del negocio (ADR-002)
-- ---------------------------------------------------------------------------
create table if not exists addresses (
  id uuid primary key default gen_random_uuid(),
  country_id uuid not null references countries(id),
  line1 text,
  line2 text,
  city text,
  state text,
  postal_code text,
  latitude numeric,
  longitude numeric,
  geocoding_status text not null default 'PENDING', -- PENDING | OK | FAILED (§22 prompt implementación)
  geocoding_provider text,
  geocoded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 5. final_customers — cliente final del customer (§8/§13)
-- ---------------------------------------------------------------------------
create table if not exists final_customers (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id),
  external_code text not null,
  name text not null,
  region text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (customer_id, external_code) -- NO único global — §8
);

-- ---------------------------------------------------------------------------
-- 6. delivery_points — 0..N por cliente final (§14)
-- ---------------------------------------------------------------------------
create table if not exists delivery_points (
  id uuid primary key default gen_random_uuid(),
  final_customer_id uuid not null references final_customers(id),
  address_id uuid references addresses(id),
  external_code text,
  name text not null,
  delivery_instructions text,
  delivery_window_start time,
  delivery_window_end time,
  is_default boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists delivery_points_final_customer_id_idx on delivery_points (final_customer_id);
-- Máximo un punto de entrega marcado is_default por cliente final.
create unique index if not exists delivery_points_one_default_per_final_customer
  on delivery_points (final_customer_id) where is_default;

-- ---------------------------------------------------------------------------
-- 7. contacts — teléfono/encargado; pertenece a UNO de los dos padres (§4)
-- ---------------------------------------------------------------------------
create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  final_customer_id uuid references final_customers(id),
  delivery_point_id uuid references delivery_points(id),
  name text,
  phone text,
  email text,
  role text,
  created_at timestamptz not null default now(),
  constraint contacts_exactly_one_parent check (
    (final_customer_id is not null)::int + (delivery_point_id is not null)::int = 1
  )
);

-- ---------------------------------------------------------------------------
-- 8. license_types -> driver_license_types (RENOMBRE, preserva filas/IDs)
--    + country_id (§10/§15). Actualiza server/tms-relations.mjs y
--    DriverModal.tsx en el mismo cambio (ver commit) para que nada quede roto.
-- ---------------------------------------------------------------------------
alter table license_types rename to driver_license_types;
alter table driver_license_types add column if not exists country_id uuid references countries(id);
alter table driver_license_types add column if not exists vehicle_restrictions jsonb;
alter table driver_license_types add column if not exists validity_rules jsonb;

-- Backfill: las 4 categorías ya cargadas (B/A2/A4/A5) son de Costa Rica.
update driver_license_types set country_id = (select id from countries where code = 'CR' limit 1)
where country_id is null;

-- driver_licenses (N:M) — se crea VACÍA; NO se migra drivers.license_type_id
-- hacia ella todavía (decisión de negocio pendiente, ver 03-modelo-datos-erd.md §9.2).
create table if not exists driver_licenses (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references drivers(id),
  driver_license_type_id uuid not null references driver_license_types(id),
  license_number text,
  expiry_date date,
  created_at timestamptz not null default now(),
  unique (driver_id, driver_license_type_id)
);

-- ---------------------------------------------------------------------------
-- 9. user_scopes — RBAC extendido con scope país/almacén/cliente (§19)
-- ---------------------------------------------------------------------------
create table if not exists user_scopes (
  id uuid primary key default gen_random_uuid(),
  app_user_id uuid not null references app_users(id),
  role_id uuid references roles(id),
  country_id uuid references countries(id),
  warehouse_id uuid references warehouses(id),
  customer_id uuid references customers(id),
  created_at timestamptz not null default now()
);
create index if not exists user_scopes_app_user_id_idx on user_scopes (app_user_id);
create index if not exists user_scopes_country_id_idx on user_scopes (country_id);
create index if not exists user_scopes_warehouse_id_idx on user_scopes (warehouse_id);
create index if not exists user_scopes_customer_id_idx on user_scopes (customer_id);

-- Backfill: los 2 usuarios reales existentes obtienen un scope GLOBAL (sin
-- país/almacén/cliente) con su rol actual, para que el nuevo modelo de
-- autorización no les quite acceso a nada que ya tenían.
insert into user_scopes (app_user_id, role_id)
select au.id, au.role_id from app_users au
where not exists (select 1 from user_scopes us where us.app_user_id = au.id);

commit;
