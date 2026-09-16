-- ============================================================================
-- ARCHIVO GENERADO — NO EDITAR A MANO.
-- Fuente: src/lib/tarifas/data/schema.ts
-- Regenerar: npm run tarifas:ddl
--
-- EJECUTAR MANUALMENTE en el editor SQL antes de apuntar el frontend a Postgres
-- (VITE_TARIFAS_DATASOURCE=postgres). La aplicación nunca ejecuta DDL por sí misma.
--
-- Solo tablas PROPIAS del tarifador. Las tablas del TMS (carriers, drivers, vehicles,
-- routes, stores) no se tocan: el tarifador las lee, nunca las escribe.
-- ============================================================================
-- País
CREATE TABLE IF NOT EXISTS tarifas_countries (
  id text PRIMARY KEY,
  iso2 text NOT NULL,
  name text NOT NULL,
  local_currency text NOT NULL,
  rounding_decimals integer NOT NULL,
  rounding_mode text NOT NULL,
  overnight_threshold_hours integer NOT NULL
);

-- Grupo de zona
CREATE TABLE IF NOT EXISTS tarifas_zone_groups (
  id text PRIMARY KEY,
  country_id text NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  status text NOT NULL,
  CONSTRAINT tarifas_zone_groups_country_id_fkey FOREIGN KEY (country_id) REFERENCES tarifas_countries (id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS tarifas_zone_groups_country_id_idx ON tarifas_zone_groups (country_id);

-- Zona
CREATE TABLE IF NOT EXISTS tarifas_zones (
  id text PRIMARY KEY,
  country_id text NOT NULL,
  zone_group_id text,
  code text NOT NULL,
  name text NOT NULL,
  status text NOT NULL,
  CONSTRAINT tarifas_zones_country_id_fkey FOREIGN KEY (country_id) REFERENCES tarifas_countries (id) ON DELETE RESTRICT,
  CONSTRAINT tarifas_zones_zone_group_id_fkey FOREIGN KEY (zone_group_id) REFERENCES tarifas_zone_groups (id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS tarifas_zones_country_id_idx ON tarifas_zones (country_id);

-- Compañía a liquidar
CREATE TABLE IF NOT EXISTS tarifas_settlement_parties (
  id text PRIMARY KEY,
  country_id text NOT NULL,
  classification text NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  tax_id text,
  tax_id_type text,
  carrier_id text,
  contact_name text,
  email text,
  phone text,
  address text,
  status text NOT NULL,
  notes text,
  CONSTRAINT tarifas_settlement_parties_country_id_fkey FOREIGN KEY (country_id) REFERENCES tarifas_countries (id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS tarifas_settlement_parties_country_id_idx ON tarifas_settlement_parties (country_id);
CREATE INDEX IF NOT EXISTS tarifas_settlement_parties_classification_idx ON tarifas_settlement_parties (classification);
CREATE INDEX IF NOT EXISTS tarifas_settlement_parties_carrier_id_idx ON tarifas_settlement_parties (carrier_id);
CREATE INDEX IF NOT EXISTS tarifas_settlement_parties_status_idx ON tarifas_settlement_parties (status);

-- Regla de tarifa
CREATE TABLE IF NOT EXISTS tarifas_pricing_rules (
  id text PRIMARY KEY,
  country_id text,
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
  is_adhoc boolean NOT NULL,
  active boolean NOT NULL,
  effective_from text,
  effective_to text,
  version integer NOT NULL,
  CONSTRAINT tarifas_pricing_rules_country_id_fkey FOREIGN KEY (country_id) REFERENCES tarifas_countries (id) ON DELETE RESTRICT,
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
  country_id text NOT NULL,
  name text NOT NULL,
  trip jsonb NOT NULL,
  CONSTRAINT tarifas_pricing_templates_country_id_fkey FOREIGN KEY (country_id) REFERENCES tarifas_countries (id) ON DELETE RESTRICT
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

-- Tipo de vehículo
CREATE TABLE IF NOT EXISTS tarifas_party_vehicle_types (
  id text PRIMARY KEY,
  party_id text NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  volume_m3 numeric NOT NULL,
  weight_tons numeric NOT NULL,
  notes text,
  active boolean NOT NULL,
  CONSTRAINT tarifas_party_vehicle_types_party_id_fkey FOREIGN KEY (party_id) REFERENCES tarifas_settlement_parties (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS tarifas_party_vehicle_types_party_id_idx ON tarifas_party_vehicle_types (party_id);
CREATE INDEX IF NOT EXISTS tarifas_party_vehicle_types_code_idx ON tarifas_party_vehicle_types (code);
CREATE INDEX IF NOT EXISTS tarifas_party_vehicle_types_active_idx ON tarifas_party_vehicle_types (active);

-- Ruta
CREATE TABLE IF NOT EXISTS tarifas_routes (
  id text PRIMARY KEY,
  country_id text NOT NULL,
  party_id text NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  origin_zone_id text NOT NULL,
  dest_zone_id text NOT NULL,
  km numeric NOT NULL,
  stop_count integer NOT NULL,
  package_count integer NOT NULL,
  weight_kg numeric NOT NULL,
  toll_count integer NOT NULL,
  tolls_amount numeric NOT NULL,
  duration_hours numeric NOT NULL,
  notes text,
  active boolean NOT NULL,
  CONSTRAINT tarifas_routes_country_id_fkey FOREIGN KEY (country_id) REFERENCES tarifas_countries (id) ON DELETE RESTRICT,
  CONSTRAINT tarifas_routes_party_id_fkey FOREIGN KEY (party_id) REFERENCES tarifas_settlement_parties (id) ON DELETE CASCADE,
  CONSTRAINT tarifas_routes_origin_zone_id_fkey FOREIGN KEY (origin_zone_id) REFERENCES tarifas_zones (id) ON DELETE RESTRICT,
  CONSTRAINT tarifas_routes_dest_zone_id_fkey FOREIGN KEY (dest_zone_id) REFERENCES tarifas_zones (id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS tarifas_routes_country_id_idx ON tarifas_routes (country_id);
CREATE INDEX IF NOT EXISTS tarifas_routes_party_id_idx ON tarifas_routes (party_id);
CREATE INDEX IF NOT EXISTS tarifas_routes_code_idx ON tarifas_routes (code);
CREATE INDEX IF NOT EXISTS tarifas_routes_origin_zone_id_idx ON tarifas_routes (origin_zone_id);
CREATE INDEX IF NOT EXISTS tarifas_routes_dest_zone_id_idx ON tarifas_routes (dest_zone_id);
CREATE INDEX IF NOT EXISTS tarifas_routes_active_idx ON tarifas_routes (active);

-- Conductor
CREATE TABLE IF NOT EXISTS tarifas_drivers (
  id text PRIMARY KEY,
  country_id text NOT NULL,
  party_id text NOT NULL,
  full_name text NOT NULL,
  document text,
  phone text,
  license text,
  license_expires_at text,
  notes text,
  active boolean NOT NULL,
  CONSTRAINT tarifas_drivers_country_id_fkey FOREIGN KEY (country_id) REFERENCES tarifas_countries (id) ON DELETE RESTRICT,
  CONSTRAINT tarifas_drivers_party_id_fkey FOREIGN KEY (party_id) REFERENCES tarifas_settlement_parties (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS tarifas_drivers_country_id_idx ON tarifas_drivers (country_id);
CREATE INDEX IF NOT EXISTS tarifas_drivers_party_id_idx ON tarifas_drivers (party_id);
CREATE INDEX IF NOT EXISTS tarifas_drivers_full_name_idx ON tarifas_drivers (full_name);
CREATE INDEX IF NOT EXISTS tarifas_drivers_document_idx ON tarifas_drivers (document);
CREATE INDEX IF NOT EXISTS tarifas_drivers_active_idx ON tarifas_drivers (active);

-- Liquidación
CREATE TABLE IF NOT EXISTS tarifas_settlements (
  id text PRIMARY KEY,
  country_id text NOT NULL,
  party_id text NOT NULL,
  route_id text,
  driver_id text,
  number text NOT NULL,
  trip_number text,
  settlement_date text NOT NULL,
  truck_type_id text,
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
  trip jsonb NOT NULL,
  trace jsonb NOT NULL,
  discarded jsonb NOT NULL,
  stage_subtotals jsonb NOT NULL,
  warnings jsonb NOT NULL,
  overrides jsonb NOT NULL,
  adhoc_rules jsonb NOT NULL,
  excluded_seqs jsonb NOT NULL,
  returns jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT tarifas_settlements_country_id_fkey FOREIGN KEY (country_id) REFERENCES tarifas_countries (id) ON DELETE RESTRICT,
  CONSTRAINT tarifas_settlements_party_id_fkey FOREIGN KEY (party_id) REFERENCES tarifas_settlement_parties (id) ON DELETE RESTRICT,
  CONSTRAINT tarifas_settlements_route_id_fkey FOREIGN KEY (route_id) REFERENCES tarifas_routes (id) ON DELETE RESTRICT,
  CONSTRAINT tarifas_settlements_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES tarifas_drivers (id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS tarifas_settlements_country_id_idx ON tarifas_settlements (country_id);
CREATE INDEX IF NOT EXISTS tarifas_settlements_party_id_idx ON tarifas_settlements (party_id);
CREATE INDEX IF NOT EXISTS tarifas_settlements_route_id_idx ON tarifas_settlements (route_id);
CREATE INDEX IF NOT EXISTS tarifas_settlements_driver_id_idx ON tarifas_settlements (driver_id);
CREATE INDEX IF NOT EXISTS tarifas_settlements_number_idx ON tarifas_settlements (number);
CREATE INDEX IF NOT EXISTS tarifas_settlements_trip_number_idx ON tarifas_settlements (trip_number);
CREATE INDEX IF NOT EXISTS tarifas_settlements_settlement_date_idx ON tarifas_settlements (settlement_date);
CREATE INDEX IF NOT EXISTS tarifas_settlements_status_idx ON tarifas_settlements (status);
CREATE INDEX IF NOT EXISTS tarifas_settlements_margin_status_idx ON tarifas_settlements (margin_status);

-- Estructura de costos
CREATE TABLE IF NOT EXISTS tarifas_cost_structures (
  id text PRIMARY KEY,
  party_id text NOT NULL,
  country_id text NOT NULL,
  name text NOT NULL,
  operating_days_per_month integer NOT NULL,
  effective_from timestamptz,
  active boolean NOT NULL,
  notes text,
  CONSTRAINT tarifas_cost_structures_party_id_fkey FOREIGN KEY (party_id) REFERENCES tarifas_settlement_parties (id) ON DELETE CASCADE,
  CONSTRAINT tarifas_cost_structures_country_id_fkey FOREIGN KEY (country_id) REFERENCES tarifas_countries (id) ON DELETE RESTRICT
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
  country_id text NOT NULL,
  party_id text,
  code text NOT NULL,
  name text NOT NULL,
  key_columns jsonb NOT NULL,
  active boolean NOT NULL,
  CONSTRAINT tarifas_rate_tables_country_id_fkey FOREIGN KEY (country_id) REFERENCES tarifas_countries (id) ON DELETE RESTRICT,
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
  country_id text NOT NULL,
  cost_per_km numeric NOT NULL,
  depreciation_per_km numeric NOT NULL,
  driver_daily numeric NOT NULL,
  CONSTRAINT tarifas_own_cost_params_country_id_fkey FOREIGN KEY (country_id) REFERENCES tarifas_countries (id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS tarifas_own_cost_params_country_id_idx ON tarifas_own_cost_params (country_id);

-- Tarifa de outsourcing
CREATE TABLE IF NOT EXISTS tarifas_outsourced_cost_rates (
  id text PRIMARY KEY,
  country_id text NOT NULL,
  carrier_id text NOT NULL,
  truck_type_id text NOT NULL,
  flat_rate numeric NOT NULL,
  CONSTRAINT tarifas_outsourced_cost_rates_country_id_fkey FOREIGN KEY (country_id) REFERENCES tarifas_countries (id) ON DELETE RESTRICT,
  CONSTRAINT tarifas_outsourced_cost_rates_carrier_id_fkey FOREIGN KEY (carrier_id) REFERENCES tarifas_settlement_parties (id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS tarifas_outsourced_cost_rates_country_id_idx ON tarifas_outsourced_cost_rates (country_id);
CREATE INDEX IF NOT EXISTS tarifas_outsourced_cost_rates_carrier_id_idx ON tarifas_outsourced_cost_rates (carrier_id);

-- Política de margen
CREATE TABLE IF NOT EXISTS tarifas_margin_policies (
  id text PRIMARY KEY,
  country_id text NOT NULL,
  warn_below numeric NOT NULL,
  critical_below numeric NOT NULL,
  require_reason_below numeric NOT NULL,
  block_on_loss boolean NOT NULL,
  CONSTRAINT tarifas_margin_policies_country_id_fkey FOREIGN KEY (country_id) REFERENCES tarifas_countries (id) ON DELETE RESTRICT
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
