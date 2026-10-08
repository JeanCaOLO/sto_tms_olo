-- ============================================================================
-- 29 — Tarifador: `settlement_date` vuelve a `text` mientras el backend desplegado sea el anterior a la 28.
--
-- Por qué: la migración 28 pasó `tarifas_settlements.settlement_date` a `date`, pero el backend
-- desplegado de `backend/tarifas` todavía manda esa columna con `::text` (su manifiesto de esquema es
-- anterior). Resultado: TODA emisión de liquidación falla con
--   column "settlement_date" is of type date but expression is of type text
-- (el UPDATE de estados no se ve afectado porque no toca esa columna).
--
-- Qué hace: solo cambia el tipo de esa columna a text conservando el formato AAAA-MM-DD. El índice
-- compuesto (country_id, settlement_date desc, number desc) se reconstruye solo, y como el formato es
-- ISO el orden de texto es el mismo que el de fecha. Los demás cambios de la 28 (índices borrados)
-- NO se tocan.
--
-- Cuándo deshacerla: cuando el backend desplegado traiga el manifiesto con `settlement_date` = date
-- (el del repo ya lo trae), volver a aplicar la 28:
--   node --env-file=.env.local scripts/run-migration.mjs sql/28_tarifas_fecha_e_indices_sobrantes.sql --execute --force
-- (la 28 solo cambia el tipo si la columna es text). Ver docs/tarifador/RUNBOOK_OPTIMIZACION_AURORA.md §2b.
--
-- Idempotente. No pierde datos. Solo toca una tabla del tarifador.
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
