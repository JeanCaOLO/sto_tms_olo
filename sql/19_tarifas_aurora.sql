-- ============================================================================
-- 19 — Liquidador automatizado sobre Aurora (docs/tarifador/ROADMAP.md §8)
--
-- Crea las tablas PROPIAS del tarifador (tarifas_*), las vistas con las que el
-- liquidador LEE los viajes de guía de despacho y sus devoluciones, los
-- permisos de la aplicación (tms_app), su registro en la bitácora del sistema
-- (sql/16) y la configuración de cálculo mínima de Costa Rica.
--
-- El liquidador NO escribe ninguna tabla del TMS: viajes (routes), guías,
-- devoluciones, transportistas, conductores, vehículos, zonas y países se
-- LEEN (backend/tarifas responde 405 a cualquier escritura sobre ellos).
--
-- Correr con el DUEÑO de las tablas (TMS_DB_ADMIN_* en .env.local):
--   node --env-file=.env.local scripts/run-migration.mjs sql/19_tarifas_aurora.sql            (dry-run)
--   node --env-file=.env.local scripts/run-migration.mjs sql/19_tarifas_aurora.sql --execute
--
-- La sección 1 es COPIA del DDL generado (sql/04_tarifas.sql, `npm run
-- tarifas:ddl`) a la fecha de esta migración: un cambio posterior del
-- esquema va en una migración nueva, no editando esta.
-- Idempotente (IF NOT EXISTS / OR REPLACE / ON CONFLICT).
-- ============================================================================

begin;

-- ── 1. Tablas propias (DDL generado desde src/lib/tarifas/data/schema.ts) ─────────────────────

-- Configuración de cálculo del país
CREATE TABLE IF NOT EXISTS tarifas_country_settings (
  id text PRIMARY KEY,
  country_id uuid NOT NULL UNIQUE,
  rounding_decimals integer NOT NULL,
  rounding_mode text NOT NULL,
  overnight_threshold_hours integer NOT NULL,
  CONSTRAINT tarifas_country_settings_country_id_fkey FOREIGN KEY (country_id) REFERENCES countries (id) ON DELETE RESTRICT
);

-- Grupo de zona
CREATE TABLE IF NOT EXISTS tarifas_zone_groups (
  id text PRIMARY KEY,
  country_id uuid NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  zone_codes jsonb NOT NULL,
  status text NOT NULL,
  CONSTRAINT tarifas_zone_groups_country_id_fkey FOREIGN KEY (country_id) REFERENCES countries (id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS tarifas_zone_groups_country_id_idx ON tarifas_zone_groups (country_id);

-- Perfil de cálculo
CREATE TABLE IF NOT EXISTS tarifas_settlement_parties (
  id text PRIMARY KEY,
  carrier_id uuid NOT NULL UNIQUE,
  status text NOT NULL,
  notes text,
  CONSTRAINT tarifas_settlement_parties_carrier_id_fkey FOREIGN KEY (carrier_id) REFERENCES carriers (id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS tarifas_settlement_parties_status_idx ON tarifas_settlement_parties (status);

-- Regla de tarifa
CREATE TABLE IF NOT EXISTS tarifas_pricing_rules (
  id text PRIMARY KEY,
  country_id uuid,
  scope text,
  party_id text,
  code text NOT NULL,
  name text NOT NULL,
  stage text NOT NULL,
  priority integer NOT NULL,
  stacking text NOT NULL,
  exclusion_group text,
  conditions jsonb NOT NULL,
  expression jsonb NOT NULL,
  description text,
  reason text,
  effect text,
  builder jsonb,
  condition_builder jsonb,
  is_adhoc boolean NOT NULL,
  active boolean NOT NULL,
  effective_from text,
  effective_to text,
  version integer NOT NULL,
  CONSTRAINT tarifas_pricing_rules_country_id_fkey FOREIGN KEY (country_id) REFERENCES countries (id) ON DELETE RESTRICT,
  CONSTRAINT tarifas_pricing_rules_party_id_fkey FOREIGN KEY (party_id) REFERENCES tarifas_settlement_parties (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS tarifas_pricing_rules_country_id_idx ON tarifas_pricing_rules (country_id);
CREATE INDEX IF NOT EXISTS tarifas_pricing_rules_scope_idx ON tarifas_pricing_rules (scope);
CREATE INDEX IF NOT EXISTS tarifas_pricing_rules_party_id_idx ON tarifas_pricing_rules (party_id);
CREATE INDEX IF NOT EXISTS tarifas_pricing_rules_stage_idx ON tarifas_pricing_rules (stage);
CREATE INDEX IF NOT EXISTS tarifas_pricing_rules_active_idx ON tarifas_pricing_rules (active);
CREATE INDEX IF NOT EXISTS tarifas_pricing_rules_effective_from_idx ON tarifas_pricing_rules (effective_from);
CREATE INDEX IF NOT EXISTS tarifas_pricing_rules_effective_to_idx ON tarifas_pricing_rules (effective_to);

-- Plantilla de viaje
CREATE TABLE IF NOT EXISTS tarifas_pricing_templates (
  id text PRIMARY KEY,
  country_id uuid NOT NULL,
  name text NOT NULL,
  trip jsonb NOT NULL,
  CONSTRAINT tarifas_pricing_templates_country_id_fkey FOREIGN KEY (country_id) REFERENCES countries (id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS tarifas_pricing_templates_country_id_idx ON tarifas_pricing_templates (country_id);

-- Variable personalizada
CREATE TABLE IF NOT EXISTS tarifas_party_variables (
  id text PRIMARY KEY,
  party_id text NOT NULL,
  key text NOT NULL,
  label text NOT NULL,
  kind text NOT NULL,
  origin text NOT NULL,
  default_value text,
  unit text,
  active boolean NOT NULL,
  CONSTRAINT tarifas_party_variables_party_id_fkey FOREIGN KEY (party_id) REFERENCES tarifas_settlement_parties (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS tarifas_party_variables_party_id_idx ON tarifas_party_variables (party_id);
CREATE INDEX IF NOT EXISTS tarifas_party_variables_key_idx ON tarifas_party_variables (key);
CREATE INDEX IF NOT EXISTS tarifas_party_variables_active_idx ON tarifas_party_variables (active);

-- Liquidación
CREATE TABLE IF NOT EXISTS tarifas_settlements (
  id text PRIMARY KEY,
  country_id uuid NOT NULL,
  trip_id uuid NOT NULL,
  party_id text,
  number text NOT NULL,
  trip_number text NOT NULL,
  settlement_date text NOT NULL,
  status text NOT NULL,
  currency text NOT NULL,
  total_amount numeric NOT NULL,
  notes text,
  margin_reason text,
  margin_status text,
  margin_amount numeric,
  margin_pct numeric,
  cost_total numeric,
  cost_model_id text,
  trip_info jsonb NOT NULL,
  trip_edits jsonb NOT NULL,
  trip jsonb NOT NULL,
  trace jsonb NOT NULL,
  discarded jsonb NOT NULL,
  stage_subtotals jsonb NOT NULL,
  warnings jsonb NOT NULL,
  overrides jsonb NOT NULL,
  adhoc_rules jsonb NOT NULL,
  excluded_seqs jsonb NOT NULL,
  returns jsonb NOT NULL,
  superseded_by text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT tarifas_settlements_country_id_fkey FOREIGN KEY (country_id) REFERENCES countries (id) ON DELETE RESTRICT,
  CONSTRAINT tarifas_settlements_trip_id_fkey FOREIGN KEY (trip_id) REFERENCES routes (id) ON DELETE RESTRICT,
  CONSTRAINT tarifas_settlements_party_id_fkey FOREIGN KEY (party_id) REFERENCES tarifas_settlement_parties (id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS tarifas_settlements_country_id_idx ON tarifas_settlements (country_id);
CREATE INDEX IF NOT EXISTS tarifas_settlements_trip_id_idx ON tarifas_settlements (trip_id);
CREATE INDEX IF NOT EXISTS tarifas_settlements_party_id_idx ON tarifas_settlements (party_id);
CREATE INDEX IF NOT EXISTS tarifas_settlements_number_idx ON tarifas_settlements (number);
CREATE INDEX IF NOT EXISTS tarifas_settlements_trip_number_idx ON tarifas_settlements (trip_number);
CREATE INDEX IF NOT EXISTS tarifas_settlements_settlement_date_idx ON tarifas_settlements (settlement_date);
CREATE INDEX IF NOT EXISTS tarifas_settlements_status_idx ON tarifas_settlements (status);
CREATE INDEX IF NOT EXISTS tarifas_settlements_margin_status_idx ON tarifas_settlements (margin_status);
CREATE INDEX IF NOT EXISTS tarifas_settlements_superseded_by_idx ON tarifas_settlements (superseded_by);
CREATE UNIQUE INDEX IF NOT EXISTS tarifas_settlements_trip_vigente_uq ON tarifas_settlements (trip_id) WHERE status <> 'Anulado';

-- Estructura de costos
CREATE TABLE IF NOT EXISTS tarifas_cost_structures (
  id text PRIMARY KEY,
  party_id text NOT NULL,
  country_id uuid NOT NULL,
  name text NOT NULL,
  operating_days_per_month integer NOT NULL,
  effective_from timestamptz,
  active boolean NOT NULL,
  notes text,
  CONSTRAINT tarifas_cost_structures_party_id_fkey FOREIGN KEY (party_id) REFERENCES tarifas_settlement_parties (id) ON DELETE CASCADE,
  CONSTRAINT tarifas_cost_structures_country_id_fkey FOREIGN KEY (country_id) REFERENCES countries (id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS tarifas_cost_structures_party_id_idx ON tarifas_cost_structures (party_id);
CREATE INDEX IF NOT EXISTS tarifas_cost_structures_country_id_idx ON tarifas_cost_structures (country_id);
CREATE INDEX IF NOT EXISTS tarifas_cost_structures_active_idx ON tarifas_cost_structures (active);

-- Fila de estructura de costos
CREATE TABLE IF NOT EXISTS tarifas_cost_structure_rows (
  id text PRIMARY KEY,
  structure_id text NOT NULL,
  code text NOT NULL,
  label text NOT NULL,
  driver text NOT NULL,
  amount numeric NOT NULL,
  sign text NOT NULL,
  applies_when jsonb,
  unit text,
  row_order integer NOT NULL,
  active boolean NOT NULL,
  CONSTRAINT tarifas_cost_structure_rows_structure_id_fkey FOREIGN KEY (structure_id) REFERENCES tarifas_cost_structures (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS tarifas_cost_structure_rows_structure_id_idx ON tarifas_cost_structure_rows (structure_id);
CREATE INDEX IF NOT EXISTS tarifas_cost_structure_rows_active_idx ON tarifas_cost_structure_rows (active);

-- Tabla de tarifas
CREATE TABLE IF NOT EXISTS tarifas_rate_tables (
  id text PRIMARY KEY,
  country_id uuid NOT NULL,
  party_id text,
  code text NOT NULL,
  name text NOT NULL,
  key_columns jsonb NOT NULL,
  active boolean NOT NULL,
  CONSTRAINT tarifas_rate_tables_country_id_fkey FOREIGN KEY (country_id) REFERENCES countries (id) ON DELETE RESTRICT,
  CONSTRAINT tarifas_rate_tables_party_id_fkey FOREIGN KEY (party_id) REFERENCES tarifas_settlement_parties (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS tarifas_rate_tables_country_id_idx ON tarifas_rate_tables (country_id);
CREATE INDEX IF NOT EXISTS tarifas_rate_tables_party_id_idx ON tarifas_rate_tables (party_id);
CREATE INDEX IF NOT EXISTS tarifas_rate_tables_code_idx ON tarifas_rate_tables (code);
CREATE INDEX IF NOT EXISTS tarifas_rate_tables_active_idx ON tarifas_rate_tables (active);

-- Fila de tabla de tarifas
CREATE TABLE IF NOT EXISTS tarifas_rate_table_rows (
  id text PRIMARY KEY,
  table_id text NOT NULL,
  key jsonb NOT NULL,
  amount numeric NOT NULL,
  row_order integer NOT NULL,
  active boolean NOT NULL,
  CONSTRAINT tarifas_rate_table_rows_table_id_fkey FOREIGN KEY (table_id) REFERENCES tarifas_rate_tables (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS tarifas_rate_table_rows_table_id_idx ON tarifas_rate_table_rows (table_id);
CREATE INDEX IF NOT EXISTS tarifas_rate_table_rows_active_idx ON tarifas_rate_table_rows (active);

-- Parámetros de costo propio
CREATE TABLE IF NOT EXISTS tarifas_own_cost_params (
  id text PRIMARY KEY,
  country_id uuid NOT NULL,
  cost_per_km numeric NOT NULL,
  depreciation_per_km numeric NOT NULL,
  driver_daily numeric NOT NULL,
  CONSTRAINT tarifas_own_cost_params_country_id_fkey FOREIGN KEY (country_id) REFERENCES countries (id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS tarifas_own_cost_params_country_id_idx ON tarifas_own_cost_params (country_id);

-- Tarifa de outsourcing
CREATE TABLE IF NOT EXISTS tarifas_outsourced_cost_rates (
  id text PRIMARY KEY,
  country_id uuid NOT NULL,
  carrier_id text NOT NULL,
  truck_type_id text NOT NULL,
  flat_rate numeric NOT NULL,
  CONSTRAINT tarifas_outsourced_cost_rates_country_id_fkey FOREIGN KEY (country_id) REFERENCES countries (id) ON DELETE RESTRICT,
  CONSTRAINT tarifas_outsourced_cost_rates_carrier_id_fkey FOREIGN KEY (carrier_id) REFERENCES tarifas_settlement_parties (id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS tarifas_outsourced_cost_rates_country_id_idx ON tarifas_outsourced_cost_rates (country_id);
CREATE INDEX IF NOT EXISTS tarifas_outsourced_cost_rates_carrier_id_idx ON tarifas_outsourced_cost_rates (carrier_id);

-- Política de margen
CREATE TABLE IF NOT EXISTS tarifas_margin_policies (
  id text PRIMARY KEY,
  country_id uuid NOT NULL,
  warn_below numeric NOT NULL,
  critical_below numeric NOT NULL,
  require_reason_below numeric NOT NULL,
  block_on_loss boolean NOT NULL,
  CONSTRAINT tarifas_margin_policies_country_id_fkey FOREIGN KEY (country_id) REFERENCES countries (id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS tarifas_margin_policies_country_id_idx ON tarifas_margin_policies (country_id);

-- Bitácora (append-only: sin UPDATE ni DELETE)
CREATE TABLE IF NOT EXISTS tarifas_audit_log (
  id text PRIMARY KEY,
  entity text NOT NULL,
  entity_id text NOT NULL,
  action text NOT NULL,
  user_name text NOT NULL,
  role text NOT NULL,
  before jsonb,
  after jsonb,
  reason text,
  created_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS tarifas_audit_log_entity_idx ON tarifas_audit_log (entity);
CREATE INDEX IF NOT EXISTS tarifas_audit_log_entity_id_idx ON tarifas_audit_log (entity_id);
CREATE INDEX IF NOT EXISTS tarifas_audit_log_created_at_idx ON tarifas_audit_log (created_at);

-- La bitácora del liquidador es append-only también EN LA BASE, no solo en la API.
create or replace function tarifas_forbid_change() returns trigger language plpgsql as $$
begin
  raise exception 'tarifas_audit_log es de solo inserción: no se modifica ni se borra';
end $$;

drop trigger if exists tarifas_audit_log_append_only on tarifas_audit_log;
create trigger tarifas_audit_log_append_only before update or delete on tarifas_audit_log
  for each row execute function tarifas_forbid_change();

-- ── 2. Vistas de LECTURA sobre el TMS ─────────────────────────────────────────────────────────

-- El viaje a liquidar, ya armado (entidad `trip` del ORM). `status` se NORMALIZA porque el TMS usa
-- varios vocabularios (completada / completed / Completada…); el liquidador solo liquida 'completed'.
-- `route_date` sale como texto 'YYYY-MM-DD' (es fecha de calendario: resuelve la vigencia de reglas).
-- `settlement_id` = liquidación VIGENTE (no anulada) del viaje.
create or replace view tarifas_v_viajes as
select r.id,
       s.country_id,
       r.route_number,
       to_char(r.route_date, 'YYYY-MM-DD') as route_date,
       case lower(btrim(coalesce(r.status, '')))
         when 'completada' then 'completed' when 'completado' then 'completed' when 'completed' then 'completed'
         when 'planificada' then 'planned' when 'planificado' then 'planned' when 'planned' then 'planned'
         when 'en_ruta' then 'in_progress' when 'en ruta' then 'in_progress' when 'en tránsito' then 'in_progress'
         when 'in_progress' then 'in_progress' when 'active' then 'in_progress' when 'despachado' then 'in_progress'
         when 'anulado' then 'cancelled' when 'anulada' then 'cancelled' when 'cancelled' then 'cancelled'
         else lower(btrim(coalesce(r.status, '')))
       end as status,
       r.carrier_id,
       c.name as carrier_name,
       c.is_flota_propia,
       r.driver_id,
       d.full_name as driver_name,
       d.document as driver_document,
       r.vehicle_id,
       v.plate as vehicle_plate,
       v.vehicle_type,
       v.capacity_weight,
       v.capacity_volume,
       r.route_type_id as dest_zone_id,
       z.code as dest_zone_code,
       z.name as dest_zone_name,
       r.total_distance,
       r.total_stops,
       r.completed_stops,
       r.total_weight,
       r.total_volume,
       r.actual_start_time,
       r.actual_end_time,
       case when r.actual_start_time is not null and r.actual_end_time > r.actual_start_time
            then round((extract(epoch from (r.actual_end_time - r.actual_start_time)) / 3600)::numeric, 2)
       end as duration_hours,
       (select count(*)::int from dispatch_guides g where g.route_id = r.id) as guide_count,
       (select count(*)::int
          from returns rt join dispatch_guides g on g.id = rt.dispatch_guide_id
         where g.route_id = r.id) as return_count,
       (select st.id from tarifas_settlements st
         where st.trip_id = r.id and st.status <> 'Anulado'
         limit 1) as settlement_id
  from routes r
  join stores s on s.id = r.store_id
  left join carriers c on c.id = r.carrier_id
  left join drivers d on d.id = r.driver_id
  left join vehicles v on v.id = r.vehicle_id
  left join zones z on z.id = r.route_type_id;

comment on view tarifas_v_viajes is
  'Viajes de guía de despacho tal como los lee el liquidador (ORM: entidad trip). Solo lectura.';

-- Devoluciones con el viaje al que pertenecen (`returns` apunta a la guía, no al viaje).
create or replace view tarifas_v_devoluciones as
select rt.id,
       g.route_id,
       rt.dispatch_guide_id,
       rt.return_number,
       rt.return_type,
       rt.reason,
       rt.product_code,
       rt.product_name,
       rt.quantity,
       rt.status
  from returns rt
  join dispatch_guides g on g.id = rt.dispatch_guide_id;

comment on view tarifas_v_devoluciones is
  'Devoluciones por viaje para precargar la liquidación (ORM: entidad tripReturn). Solo lectura.';

-- ── 3. Permisos de la aplicación (tms_app, sql/18) ────────────────────────────────────────────

do $$
declare
  t text;
begin
  if not exists (select 1 from pg_roles where rolname = 'tms_app') then
    raise notice 'tms_app no existe: se omiten los GRANT (correr sql/18 primero)';
    return;
  end if;
  -- Tablas propias: lectura y escritura de datos.
  for t in select tablename from pg_tables where schemaname = 'public' and tablename like 'tarifas\_%' loop
    execute format('grant select, insert, update, delete on public.%I to tms_app', t);
  end loop;
  -- Bitácora del liquidador: solo leer e insertar.
  execute 'revoke update, delete, truncate on public.tarifas_audit_log from tms_app';
  -- Vistas: solo lectura.
  execute 'revoke all on public.tarifas_v_viajes, public.tarifas_v_devoluciones from tms_app';
  execute 'grant select on public.tarifas_v_viajes, public.tarifas_v_devoluciones to tms_app';
end $$;

-- ── 4. Bitácora del sistema (sql/16): registrar las tablas propias y colgarles el trigger ─────
-- `tarifas_audit_log` NO se registra: ya es la bitácora propia del liquidador.

insert into audit.tracked_tables (table_name, module_key, id_column, masked_columns)
select tablename, 'tarifas', 'id', '{}'
  from pg_tables
 where schemaname = 'public' and tablename like 'tarifas\_%' and tablename <> 'tarifas_audit_log'
on conflict (table_name) do update set module_key = excluded.module_key, id_column = excluded.id_column;

do $$
declare
  t record;
begin
  for t in select table_name from audit.tracked_tables where table_name like 'tarifas\_%' loop
    if to_regclass('public.' || quote_ident(t.table_name)) is not null then
      execute format('drop trigger if exists audit_row_change on public.%I', t.table_name);
      execute format('create trigger audit_row_change after insert or update or delete on public.%I '
                     'for each row execute function audit.capture_row_change()', t.table_name);
    end if;
  end loop;
end $$;

-- ── 5. Configuración de cálculo mínima de Costa Rica ─────────────────────────────────────────
-- Redondeo/pernocta y política de margen. La MONEDA no va acá: es la que tenga el país en el
-- catálogo (`countries.currency`). ON CONFLICT DO NOTHING: re-correr no pisa lo ya ajustado.
--
-- Los parámetros de costo de flota propia (tarifas_own_cost_params) NO se siembran a propósito
-- (decisión 2026-10-02): son datos de negocio, y un valor inventado (p. ej. 0) daría márgenes
-- falsos. Hasta que se carguen en Reglas de Tarifa → Costos, el liquidador avisa
-- "No hay parámetros de costo para Costa Rica" y no calcula.

insert into tarifas_country_settings (id, country_id, rounding_decimals, rounding_mode, overnight_threshold_hours)
select 'CSET_CR', id, 2, 'HALF_UP', 24 from countries where code = 'CR'
on conflict do nothing;

insert into tarifas_margin_policies (id, country_id, warn_below, critical_below, require_reason_below, block_on_loss)
select 'MP_CR', id, 0.18, 0.08, 0.18, false from countries where code = 'CR'
on conflict do nothing;

commit;
