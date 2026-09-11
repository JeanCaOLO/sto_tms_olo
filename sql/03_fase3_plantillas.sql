-- ============================================================================
-- ADVERTENCIA: este script NO se ejecuta automáticamente.
-- Debe correrse manualmente en el SQL editor de Supabase (o vía CLI) DESPUÉS
-- de sql/01_fase1_zonas_reglas.sql y ANTES de usar la pestaña "Plantillas" del
-- motor de tarifas con Supabase real (hoy funciona en modo de prueba local).
-- ============================================================================

begin;

create table if not exists pricing_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  country_id uuid not null references countries(id),
  name text not null,
  trip jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

alter table pricing_templates enable row level security;

create policy pricing_templates_org_isolation on pricing_templates
  using (organization_id = (select organization_id from app_users where auth_user_id = auth.uid()))
  with check (organization_id = (select organization_id from app_users where auth_user_id = auth.uid()));

commit;
