-- ============================================================================
-- 29 — Tarifador: `settlement_date` se queda en `text` (formato AAAA-MM-DD).
--
-- La migración 28 la había pasado a `date`. El backend ya desplegado manda esa columna con `::text`; con
-- `date` toda emisión de liquidación falla con
--   column "settlement_date" is of type date but expression is of type text
-- Para que el backend desplegado y el nuevo funcionen con LA MISMA columna, sin pasos manuales de
-- migración al desplegar, la columna se queda en `text`. El formato ISO ordena y compara igual que una
-- fecha, así que el orden, los filtros por rango y el cursor del historial no cambian.
--
-- Secuencia: la 28 (si la columna es text la pasa a date) y esta 29 (si es date la devuelve a text) dejan
-- SIEMPRE `text`, sea cual sea el punto de partida. El manifiesto del backend
-- (`backend/tarifas/src/schema_manifest.json`), `src/lib/tarifas/data/schema.ts` y `sql/04_tarifas.sql`
-- dicen `text`.
--
-- Si más adelante se quiere `date`, hay que cambiar a la vez schema.ts, el manifiesto, el DDL y esta
-- migración, y desplegar el backend en el mismo momento.
--
-- Idempotente. No pierde datos. Solo toca una columna de `tarifas_settlements`.
-- ============================================================================

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tarifas_settlements'
      and column_name = 'settlement_date' and data_type = 'date'
  ) then
    alter table tarifas_settlements
      alter column settlement_date type text using to_char(settlement_date, 'YYYY-MM-DD');
  end if;
end $$;
