-- ============================================================================
-- 26 — Rendimiento del tarifador: número de liquidación sin carrera e índices de lectura.
--
--   * (country_id, number) ÚNICO en tarifas_settlements. `nextNumber` calcula el siguiente número
--     leyendo el máximo; sin unicidad, dos emisiones simultáneas podían repetir `LIQ-NNNN`. Con el
--     índice, la segunda falla con 23505 y la app lo informa en vez de duplicar. Si ya hay números
--     repetidos NO se crea (se avisa): corregirlos a mano y volver a correr.
--   * (country_id, settlement_date desc, number desc): la lista de liquidaciones filtra por país y
--     ordena por fecha y número.
--   * (table_id, active) en filas de tarifario: se leen siempre por tarifario y solo las activas.
--
-- Aditiva e idempotente. No borra nada: los índices individuales de baja cardinalidad quedan hasta
-- medirlos con pg_stat_user_indexes (ver docs/tarifador/RUNBOOK_OPTIMIZACION_AURORA.md).
--
-- ROLLBACK:
--   drop index if exists tarifas_settlements_country_number_uq;
--   drop index if exists tarifas_settlements_country_date_idx;
--   drop index if exists tarifas_rate_table_rows_table_active_idx;
-- ============================================================================

do $$
begin
  if exists (
    select 1 from tarifas_settlements group by country_id, number having count(*) > 1
  ) then
    raise warning 'tarifas_settlements tiene números repetidos por país: no se crea el índice único. Revisar con: select country_id, number, count(*) from tarifas_settlements group by 1, 2 having count(*) > 1;';
  else
    create unique index if not exists tarifas_settlements_country_number_uq
      on tarifas_settlements (country_id, number);
  end if;
end $$;

create index if not exists tarifas_settlements_country_date_idx
  on tarifas_settlements (country_id, settlement_date desc, number desc);

create index if not exists tarifas_rate_table_rows_table_active_idx
  on tarifas_rate_table_rows (table_id, active);
