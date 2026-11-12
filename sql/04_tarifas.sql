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

-- Adjudicación de tendering
CREATE TABLE IF NOT EXISTS tarifas_trip_tender_awards (
  id text PRIMARY KEY,
  country_id uuid NOT NULL,
  trip_id uuid NOT NULL,
  carrier_id uuid NOT NULL,
  amount numeric NOT NULL,
  awarded_at timestamptz,
  actor text,
  notes text,
  CONSTRAINT tarifas_trip_tender_awards_country_id_fkey FOREIGN KEY (country_id) REFERENCES countries (id) ON DELETE RESTRICT,
  CONSTRAINT tarifas_trip_tender_awards_trip_id_fkey FOREIGN KEY (trip_id) REFERENCES routes (id) ON DELETE RESTRICT,
  CONSTRAINT tarifas_trip_tender_awards_carrier_id_fkey FOREIGN KEY (carrier_id) REFERENCES carriers (id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS tarifas_trip_tender_awards_country_id_idx ON tarifas_trip_tender_awards (country_id);
CREATE INDEX IF NOT EXISTS tarifas_trip_tender_awards_trip_id_idx ON tarifas_trip_tender_awards (trip_id);
CREATE INDEX IF NOT EXISTS tarifas_trip_tender_awards_carrier_id_idx ON tarifas_trip_tender_awards (carrier_id);
CREATE UNIQUE INDEX IF NOT EXISTS tarifas_trip_tender_awards_uq ON tarifas_trip_tender_awards (trip_id);

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

-- Regla de tarifa
CREATE TABLE IF NOT EXISTS tarifas_pricing_rules (
  id text PRIMARY KEY,
  country_id uuid,
  scope text,
  party_id text,
  code text NOT NULL,
  name text NOT NULL,
  stage text NOT NULL,
  category text,
  priority integer NOT NULL,
  stacking text NOT NULL,
  exclusion_group text,
  applies_to_base jsonb,
  base_method text,
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
CREATE INDEX IF NOT EXISTS tarifas_pricing_rules_party_id_idx ON tarifas_pricing_rules (party_id);

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
  base_change jsonb,
  void_kind text,
  void_reason text,
  claim_id text,
  from_claim_id text,
  returns jsonb NOT NULL,
  superseded_by text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT tarifas_settlements_country_id_fkey FOREIGN KEY (country_id) REFERENCES countries (id) ON DELETE RESTRICT,
  CONSTRAINT tarifas_settlements_trip_id_fkey FOREIGN KEY (trip_id) REFERENCES routes (id) ON DELETE RESTRICT,
  CONSTRAINT tarifas_settlements_party_id_fkey FOREIGN KEY (party_id) REFERENCES tarifas_settlement_parties (id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS tarifas_settlements_trip_id_idx ON tarifas_settlements (trip_id);
CREATE INDEX IF NOT EXISTS tarifas_settlements_party_id_idx ON tarifas_settlements (party_id);
CREATE INDEX IF NOT EXISTS tarifas_settlements_trip_number_idx ON tarifas_settlements (trip_number);
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

-- Reclamo de proforma
CREATE TABLE IF NOT EXISTS tarifas_proforma_claims (
  id text PRIMARY KEY,
  country_id uuid NOT NULL,
  proforma_id text NOT NULL,
  phase_id text NOT NULL,
  phase_name text NOT NULL,
  raised_by text NOT NULL,
  raised_role text,
  reason text NOT NULL,
  status text NOT NULL,
  appeal_reason text,
  appealed_by text,
  appealed_at timestamptz,
  resolved_by text,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL,
  CONSTRAINT tarifas_proforma_claims_country_id_fkey FOREIGN KEY (country_id) REFERENCES countries (id) ON DELETE RESTRICT,
  CONSTRAINT tarifas_proforma_claims_proforma_id_fkey FOREIGN KEY (proforma_id) REFERENCES tarifas_proformas (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS tarifas_proforma_claims_country_id_idx ON tarifas_proforma_claims (country_id);
CREATE INDEX IF NOT EXISTS tarifas_proforma_claims_proforma_id_idx ON tarifas_proforma_claims (proforma_id);
CREATE INDEX IF NOT EXISTS tarifas_proforma_claims_status_idx ON tarifas_proforma_claims (status);
CREATE INDEX IF NOT EXISTS tarifas_proforma_claims_created_at_idx ON tarifas_proforma_claims (created_at);

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
