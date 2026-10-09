-- ============================================================================
-- 28 — Tarifador: la fecha de la liquidación pasa a `date` y se quitan índices que no sirven.
--
--   * tarifas_settlements.settlement_date: text -> date. Se ordena y se filtra por rango; con `date`
--     Postgres compara fechas de verdad (y rechaza '2026-13-45'). Solo cambia el tipo: la app sigue
--     leyendo 'YYYY-MM-DD' (el API devuelve medianoche UTC y el cliente se queda con la fecha).
--     Se rebuilda el índice compuesto (country_id, settlement_date desc, number desc) solo.
--     Si alguna fila no tiene formato AAAA-MM-DD NO se cambia el tipo (se avisa).
--   * Índices que se borran (todas tablas propias del tarifador):
--       - de baja cardinalidad, que Postgres no usa para filtrar: `active`, `stage`, `scope`,
--         `status`, `margin_status`, `effective_from/to` (el motor filtra vigencia en el cliente);
--       - redundantes: `tarifas_settlements_country_id_idx` (lo cubre (country_id, number)),
--         `tarifas_settlements_number_idx` y `tarifas_settlements_settlement_date_idx` (toda lista
--         filtra por país: lo cubren los dos compuestos), y `tarifas_rate_table_rows_table_active_idx`
--         (nunca se filtra por `active` en el servidor; basta `table_id`).
--     Todos con 0 usos en pg_stat_user_indexes. Cada índice de más cuesta en cada INSERT/UPDATE.
--     Se conservan: claves primarias, únicos, FK (country_id, party_id, trip_id, structure_id,
--     table_id), bitácora (entity, entity_id, created_at), trip_number y superseded_by.
--
-- Idempotente. Con DROP INDEX no se pierde ningún dato.
--
-- ROLLBACK (recrear lo borrado; el tipo date -> text conserva el formato AAAA-MM-DD):
--   alter table tarifas_settlements alter column settlement_date type text using to_char(settlement_date, 'YYYY-MM-DD');
--   create index if not exists tarifas_settlements_settlement_date_idx on tarifas_settlements (settlement_date);
--   create index if not exists tarifas_settlements_country_id_idx on tarifas_settlements (country_id);
--   create index if not exists tarifas_settlements_number_idx on tarifas_settlements (number);
--   create index if not exists tarifas_settlements_status_idx on tarifas_settlements (status);
--   create index if not exists tarifas_settlements_margin_status_idx on tarifas_settlements (margin_status);
--   create index if not exists tarifas_settlement_parties_status_idx on tarifas_settlement_parties (status);
--   create index if not exists tarifas_pricing_rules_scope_idx on tarifas_pricing_rules (scope);
--   create index if not exists tarifas_pricing_rules_stage_idx on tarifas_pricing_rules (stage);
--   create index if not exists tarifas_pricing_rules_active_idx on tarifas_pricing_rules (active);
--   create index if not exists tarifas_pricing_rules_effective_from_idx on tarifas_pricing_rules (effective_from);
--   create index if not exists tarifas_pricing_rules_effective_to_idx on tarifas_pricing_rules (effective_to);
--   create index if not exists tarifas_party_variables_active_idx on tarifas_party_variables (active);
--   create index if not exists tarifas_cost_structures_active_idx on tarifas_cost_structures (active);
--   create index if not exists tarifas_cost_structure_rows_active_idx on tarifas_cost_structure_rows (active);
--   create index if not exists tarifas_rate_tables_active_idx on tarifas_rate_tables (active);
--   create index if not exists tarifas_rate_table_rows_active_idx on tarifas_rate_table_rows (active);
--   create index if not exists tarifas_rate_table_rows_table_active_idx on tarifas_rate_table_rows (table_id, active);
-- ============================================================================

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tarifas_settlements'
      and column_name = 'settlement_date' and data_type = 'text'
  ) then
    if exists (select 1 from tarifas_settlements where settlement_date !~ '^\d{4}-\d{2}-\d{2}$') then
      raise warning 'tarifas_settlements.settlement_date tiene valores que no son AAAA-MM-DD: no se cambia el tipo.';
    else
      -- El índice solo-fecha se borra antes: se recrearía para nada.
      drop index if exists tarifas_settlements_settlement_date_idx;
      alter table tarifas_settlements
        alter column settlement_date type date using settlement_date::date;
    end if;
  end if;
end $$;

drop index if exists tarifas_settlements_settlement_date_idx;
drop index if exists tarifas_settlements_country_id_idx;
drop index if exists tarifas_settlements_number_idx;
drop index if exists tarifas_settlements_status_idx;
drop index if exists tarifas_settlements_margin_status_idx;
drop index if exists tarifas_settlement_parties_status_idx;
drop index if exists tarifas_pricing_rules_scope_idx;
drop index if exists tarifas_pricing_rules_stage_idx;
drop index if exists tarifas_pricing_rules_active_idx;
drop index if exists tarifas_pricing_rules_effective_from_idx;
drop index if exists tarifas_pricing_rules_effective_to_idx;
drop index if exists tarifas_party_variables_active_idx;
drop index if exists tarifas_cost_structures_active_idx;
drop index if exists tarifas_cost_structure_rows_active_idx;
drop index if exists tarifas_rate_tables_active_idx;
drop index if exists tarifas_rate_table_rows_active_idx;
drop index if exists tarifas_rate_table_rows_table_active_idx;
