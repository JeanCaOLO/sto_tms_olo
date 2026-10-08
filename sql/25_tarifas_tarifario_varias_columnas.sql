-- ============================================================================
-- 25 — Tarifarios con varias columnas de valor.
--
-- Un tarifario daba UN valor por fila. Ahora puede dar varios (por ejemplo "flete" y "peaje" para la
-- misma combinación de zona y camión) y cada regla elige la columna que usa (`LOOKUP_TABLE.column`).
--
--   * tarifas_rate_tables.value_columns: nombres de las columnas adicionales al valor principal.
--   * tarifas_rate_table_rows.extra_values: sus valores por nombre.
--
-- Aditiva e idempotente: los tarifarios existentes siguen con su único valor (`amount`).
-- ============================================================================

alter table tarifas_rate_tables add column if not exists value_columns jsonb;
alter table tarifas_rate_table_rows add column if not exists extra_values jsonb;
