-- ============================================================================
-- ADVERTENCIA: este script NO se ejecuta automáticamente.
-- Debe correrse manualmente en el SQL editor de Supabase (o vía CLI) ANTES de
-- usar las funcionalidades de la Fase 1 del motor de tarifas.
--
-- IMPORTANTE: este proyecto no tiene migraciones ni un archivo de tipos
-- generado — este script fue escrito inspeccionando el código fuente que
-- consulta cada tabla, NO el esquema real de Postgres. Revisar cada
-- sentencia (nombres de columna, tipos, políticas RLS) contra el esquema
-- real antes de aplicar, especialmente las políticas RLS: se generan acá
-- siguiendo el patrón `organization_id` visible en el resto del código
-- (vía app_users.organization_id), pero las políticas RLS reales de las
-- tablas existentes no son visibles desde el código de la aplicación y
-- podrían diferir. Ejecutar dentro de una transacción y revisar el
-- resultado antes de hacer commit.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Catálogo de zonas
-- ---------------------------------------------------------------------------

create table if not exists zone_groups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  country_id uuid references countries(id),
  code text not null,
  name text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);

create table if not exists zones (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  country_id uuid references countries(id),
  zone_group_id uuid references zone_groups(id),
  -- `code` es lo que las reglas de tarifa referencian como originZone/destZone (nunca el `id`).
  code text not null,
  name text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);

-- destino de la ruta: route_types ya se usa en la práctica como "zona" (ver placeholder
-- "Ej: GAM, Zona Norte, Zona Sur" en RouteTypeModal.tsx).
alter table route_types add column if not exists zone_id uuid references zones(id);

-- origen de la ruta: la tienda/bodega (stores.is_origin = true) asociada a routes.store_id.
alter table stores add column if not exists zone_id uuid references zones(id);

create table if not exists zone_lane_rates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  origin_zone_id uuid not null references zones(id),
  dest_zone_id uuid not null references zones(id),
  amount numeric not null,
  currency text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2. Tasas de cambio (histórico por país)
-- ---------------------------------------------------------------------------

create table if not exists fx_rates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  country_id uuid not null references countries(id),
  from_currency text not null,
  to_currency text not null,
  rate numeric not null,
  rate_type text not null check (rate_type in ('OFFICIAL', 'PARALLEL', 'INTERNAL')),
  source text,
  valid_from timestamptz not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 3. Reglas de tarifa (mapea 1:1 al tipo `Rule` del kernel en src/lib/tarifas/types.ts)
-- ---------------------------------------------------------------------------

create table if not exists pricing_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  country_id uuid references countries(id),
  code text not null,
  name text not null,
  stage text not null check (stage in ('BASE', 'VARIABLE', 'MODIFIER', 'SURCHARGE', 'ADJUSTMENT', 'TAX')),
  priority integer not null default 10,
  stacking text not null check (stacking in ('SUM', 'MAX', 'EXCLUSIVE')),
  exclusion_group text,
  currency_mode text not null default 'LOCAL' check (currency_mode in ('REF', 'LOCAL')),
  conditions jsonb not null,
  expression jsonb not null,
  is_adhoc boolean not null default false,
  active boolean not null default true,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);

-- La tabla vieja de tarifas planas (`rates`) NO se toca ni se migra — queda disponible por si se
-- quiere consultar o borrar más adelante, una vez que `pricing_rules` esté en uso.

-- ---------------------------------------------------------------------------
-- 4. Campos de `Country` que el kernel necesita y `countries` no tiene hoy
-- ---------------------------------------------------------------------------

alter table countries add column if not exists rounding_decimals int not null default 2;
alter table countries add column if not exists rounding_mode text not null default 'HALF_UP'
  check (rounding_mode in ('HALF_UP', 'HALF_EVEN', 'UP', 'DOWN'));
alter table countries add column if not exists overnight_threshold_hours numeric not null default 24;
-- Nullable a propósito: si es null, el código de la aplicación usa `currency` como fallback (una
-- sola moneda local = referencia, sin conversión).
alter table countries add column if not exists ref_currency text;

-- ---------------------------------------------------------------------------
-- 5. Columnas de desglose en `settlements`
-- ---------------------------------------------------------------------------

alter table settlements add column if not exists trace jsonb;
alter table settlements add column if not exists discarded jsonb;
alter table settlements add column if not exists stage_subtotals jsonb;
alter table settlements add column if not exists fx_used jsonb;
alter table settlements add column if not exists warnings jsonb;
alter table settlements add column if not exists origin_zone_id uuid references zones(id);
alter table settlements add column if not exists dest_zone_id uuid references zones(id);

-- ---------------------------------------------------------------------------
-- 6. RLS multi-tenant (mismo patrón de aislamiento por organization_id que el resto del esquema)
-- ---------------------------------------------------------------------------

alter table zone_groups enable row level security;
alter table zones enable row level security;
alter table zone_lane_rates enable row level security;
alter table fx_rates enable row level security;
alter table pricing_rules enable row level security;

create policy zone_groups_org_isolation on zone_groups
  using (organization_id = (select organization_id from app_users where auth_user_id = auth.uid()))
  with check (organization_id = (select organization_id from app_users where auth_user_id = auth.uid()));

create policy zones_org_isolation on zones
  using (organization_id = (select organization_id from app_users where auth_user_id = auth.uid()))
  with check (organization_id = (select organization_id from app_users where auth_user_id = auth.uid()));

create policy zone_lane_rates_org_isolation on zone_lane_rates
  using (organization_id = (select organization_id from app_users where auth_user_id = auth.uid()))
  with check (organization_id = (select organization_id from app_users where auth_user_id = auth.uid()));

create policy fx_rates_org_isolation on fx_rates
  using (organization_id = (select organization_id from app_users where auth_user_id = auth.uid()))
  with check (organization_id = (select organization_id from app_users where auth_user_id = auth.uid()));

create policy pricing_rules_org_isolation on pricing_rules
  using (organization_id = (select organization_id from app_users where auth_user_id = auth.uid()))
  with check (organization_id = (select organization_id from app_users where auth_user_id = auth.uid()));

commit;
