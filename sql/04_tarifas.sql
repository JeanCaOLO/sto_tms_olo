-- ============================================================================
-- ARCHIVO GENERADO — NO EDITAR A MANO.
-- Fuente: src/lib/tarifas/data/schema.ts
-- Regenerar: npm run tarifas:ddl
--
-- Solo tablas PROPIAS del tarifador (tarifas_*). Las del TMS (countries, zones,
-- carriers, drivers, vehicles, routes, dispatch_guides, returns) no se tocan: el
-- tarifador las lee, nunca las escribe. Sus FK sí las referencian.
--
-- Lo aplica sql/19_tarifas_aurora.sql, junto con las vistas que leen las entidades
-- externas. La aplicación nunca ejecuta DDL por sí misma.
-- ============================================================================
-- Marca de pedido
CREATE TABLE IF NOT EXISTS tarifas_trip_order_marks (
  id text PRIMARY KEY,
  country_id uuid NOT NULL,
  trip_id uuid NOT NULL,
  order_id uuid NOT NULL,
  mark text NOT NULL,
  reason text,
  actor text,
  CONSTRAINT tarifas_trip_order_marks_country_id_fkey FOREIGN KEY (country_id) REFERENCES countries (id) ON DELETE RESTRICT,
  CONSTRAINT tarifas_trip_order_marks_trip_id_fkey FOREIGN KEY (trip_id) REFERENCES routes (id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS tarifas_trip_order_marks_country_id_idx ON tarifas_trip_order_marks (country_id);
CREATE INDEX IF NOT EXISTS tarifas_trip_order_marks_trip_id_idx ON tarifas_trip_order_marks (trip_id);
CREATE UNIQUE INDEX IF NOT EXISTS tarifas_trip_order_marks_uq ON tarifas_trip_order_marks (trip_id, order_id);

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
  cargo_value numeric,
  allocation jsonb,
  orders jsonb,
  trip_info jsonb NOT NULL,
  trip_edits jsonb NOT NULL,
  trip jsonb NOT NULL,
  trace jsonb NOT NULL,
  discarded jsonb NOT NULL,
  stage_subtotals jsonb NOT NULL,
  warnings jsonb NOT NULL,
  overrides jsonb NOT NULL,
  adhoc_rules jsonb NOT NULL,
  rules_used jsonb NOT NULL,
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
CREATE UNIQUE INDEX IF NOT EXISTS tarifas_settlements_country_number_uq ON tarifas_settlements (country_id, number);

-- Estructura de costos
CREATE TABLE IF NOT EXISTS tarifas_cost_structures (
  id text PRIMARY KEY,
  party_id text,
  country_id uuid NOT NULL,
  name text NOT NULL,
  operating_days_per_month integer NOT NULL,
  params jsonb NOT NULL,
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
  cost_group text,
  frequency text,
  frequency_qty numeric,
  unit_qty numeric,
  cost_per_km numeric,
  truck_type text,
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
  value_columns jsonb,
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
  extra_values jsonb,
  row_order integer NOT NULL,
  active boolean NOT NULL,
  CONSTRAINT tarifas_rate_table_rows_table_id_fkey FOREIGN KEY (table_id) REFERENCES tarifas_rate_tables (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS tarifas_rate_table_rows_table_id_idx ON tarifas_rate_table_rows (table_id);
CREATE INDEX IF NOT EXISTS tarifas_rate_table_rows_active_idx ON tarifas_rate_table_rows (active);

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
