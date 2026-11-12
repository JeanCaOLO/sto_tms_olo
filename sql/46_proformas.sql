-- ============================================================================
-- 46 — Proformas del tarifador: varias liquidaciones de un transportista con revisión por fases.
--
--   tarifas_proformas               cabecera (estado = los de la liquidación)
--   tarifas_proforma_items          liquidaciones agrupadas (incluida / excluida)
--   tarifas_proforma_phases         fases de CADA proforma (copia de la plantilla + decisiones)
--   tarifas_proforma_flow_phases    plantilla global del país: fases y quién aprueba cada una
--   tarifas_proforma_email_config   destinatarios y modo de envío del correo, por país
--
-- Módulo de permisos nuevo `tarifas.proformas` (ver / crear / editar). Los administradores lo tienen
-- por código; a los demás roles se les da en Configuración → Roles.
-- Las tablas salen del registro de esquema (npm run tarifas:ddl). Idempotente.
-- Aplicar con: node --env-file=.env.local scripts/run-migration.mjs sql/46_proformas.sql [--execute]
-- ============================================================================

begin;

insert into app_modules (key, group_key, path, sort_order) values
  ('tarifas.proformas', null, '/proformas', 72)
on conflict (key) do update
  set group_key = excluded.group_key, path = excluded.path, sort_order = excluded.sort_order;

-- Proforma
CREATE TABLE IF NOT EXISTS tarifas_proformas (
  id text PRIMARY KEY,
  country_id uuid NOT NULL,
  number text NOT NULL,
  carrier_id uuid NOT NULL,
  carrier_name text NOT NULL,
  status text NOT NULL,
  currency text NOT NULL,
  total_amount numeric NOT NULL,
  created_by text NOT NULL,
  email_sent_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT tarifas_proformas_country_id_fkey FOREIGN KEY (country_id) REFERENCES countries (id) ON DELETE RESTRICT,
  CONSTRAINT tarifas_proformas_carrier_id_fkey FOREIGN KEY (carrier_id) REFERENCES carriers (id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS tarifas_proformas_country_id_idx ON tarifas_proformas (country_id);
CREATE INDEX IF NOT EXISTS tarifas_proformas_carrier_id_idx ON tarifas_proformas (carrier_id);
CREATE INDEX IF NOT EXISTS tarifas_proformas_status_idx ON tarifas_proformas (status);
CREATE UNIQUE INDEX IF NOT EXISTS tarifas_proformas_country_number_uq ON tarifas_proformas (country_id, number);

-- Liquidación de proforma
CREATE TABLE IF NOT EXISTS tarifas_proforma_items (
  id text PRIMARY KEY,
  proforma_id text NOT NULL,
  settlement_id text NOT NULL,
  state text NOT NULL,
  exclusion_reason text,
  amount numeric NOT NULL,
  CONSTRAINT tarifas_proforma_items_proforma_id_fkey FOREIGN KEY (proforma_id) REFERENCES tarifas_proformas (id) ON DELETE CASCADE,
  CONSTRAINT tarifas_proforma_items_settlement_id_fkey FOREIGN KEY (settlement_id) REFERENCES tarifas_settlements (id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS tarifas_proforma_items_proforma_id_idx ON tarifas_proforma_items (proforma_id);
CREATE INDEX IF NOT EXISTS tarifas_proforma_items_settlement_id_idx ON tarifas_proforma_items (settlement_id);
CREATE UNIQUE INDEX IF NOT EXISTS tarifas_proforma_items_settlement_incluida_uq ON tarifas_proforma_items (settlement_id) WHERE state <> 'excluded';

-- Fase de proforma
CREATE TABLE IF NOT EXISTS tarifas_proforma_phases (
  id text PRIMARY KEY,
  proforma_id text NOT NULL,
  position integer NOT NULL,
  name text NOT NULL,
  approver_type text NOT NULL,
  role_name text,
  user_id text,
  approver_label text NOT NULL,
  state text NOT NULL,
  decided_by text,
  decided_at timestamptz,
  comment text,
  removed_by text,
  CONSTRAINT tarifas_proforma_phases_proforma_id_fkey FOREIGN KEY (proforma_id) REFERENCES tarifas_proformas (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS tarifas_proforma_phases_proforma_id_idx ON tarifas_proforma_phases (proforma_id);
CREATE INDEX IF NOT EXISTS tarifas_proforma_phases_state_idx ON tarifas_proforma_phases (state);

-- Fase del flujo de proformas
CREATE TABLE IF NOT EXISTS tarifas_proforma_flow_phases (
  id text PRIMARY KEY,
  country_id uuid NOT NULL,
  position integer NOT NULL,
  name text NOT NULL,
  approver_type text NOT NULL,
  role_name text,
  user_id text,
  approver_label text NOT NULL,
  active boolean NOT NULL,
  CONSTRAINT tarifas_proforma_flow_phases_country_id_fkey FOREIGN KEY (country_id) REFERENCES countries (id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS tarifas_proforma_flow_phases_country_id_idx ON tarifas_proforma_flow_phases (country_id);

-- Correo de proformas
CREATE TABLE IF NOT EXISTS tarifas_proforma_email_config (
  id text PRIMARY KEY,
  country_id uuid NOT NULL,
  recipients jsonb NOT NULL,
  include_carrier_email boolean NOT NULL,
  subject_template text NOT NULL,
  body_template text NOT NULL,
  mode text NOT NULL,
  CONSTRAINT tarifas_proforma_email_config_country_id_fkey FOREIGN KEY (country_id) REFERENCES countries (id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX IF NOT EXISTS tarifas_proforma_email_config_country_uq ON tarifas_proforma_email_config (country_id);

-- Permisos de la aplicación y bitácora del sistema (mismo patrón que sql/19).
do $$
declare
  t text;
begin
  if exists (select 1 from pg_roles where rolname = 'tms_app') then
    for t in select tablename from pg_tables where schemaname = 'public' and tablename like 'tarifas\_proforma%' loop
      execute format('grant select, insert, update, delete on public.%I to tms_app', t);
    end loop;
  else
    raise notice 'tms_app no existe: se omiten los GRANT (correr sql/18 primero)';
  end if;
end $$;

insert into audit.tracked_tables (table_name, module_key, id_column, masked_columns)
select tablename, 'tarifas', 'id', '{}'
  from pg_tables
 where schemaname = 'public' and tablename like 'tarifas\_proforma%'
on conflict (table_name) do update set module_key = excluded.module_key, id_column = excluded.id_column;

do $$
declare
  t record;
begin
  for t in select table_name from audit.tracked_tables where table_name like 'tarifas\_proforma%' loop
    if to_regclass('public.' || quote_ident(t.table_name)) is not null then
      execute format('drop trigger if exists audit_row_change on public.%I', t.table_name);
      execute format('create trigger audit_row_change after insert or update or delete on public.%I '
                     'for each row execute function audit.capture_row_change()', t.table_name);
    end if;
  end loop;
end $$;

commit;
