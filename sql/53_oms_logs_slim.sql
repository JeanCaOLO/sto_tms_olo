-- ============================================================================
-- 53 — Adelgaza oms_logs: quita columnas de contexto dispersas → al JSON `detail`.
--
-- Decisión de diseño: las columnas tipadas que no sabemos si usaremos (viaje,
-- pedido, país, compañía) estaban SIEMPRE en NULL. En vez de columnas fijas que
-- quizá no se llenen, lo contextual/variable vive en `detail` (jsonb), que es
-- extensible sin migrar el esquema. Se conservan las columnas ESTABLES: level,
-- action, message, actor, corrida_id (llave de correlación, con índice).
--
-- Sin pérdida de datos: las 4 columnas eliminadas están 100% en NULL hoy.
-- Los índices actuales (created_at, level, corrida_id) NO se ven afectados.
--
-- Uso:  node --env-file=.env scripts/run-migration.mjs sql/53_...sql            (dry-run)
--       node --env-file=.env scripts/run-migration.mjs sql/53_...sql --execute
-- ============================================================================

begin;

alter table oms_logs
  drop column if exists numero_viaje,
  drop column if exists eflow_id_expedicion,
  drop column if exists country_id,
  drop column if exists company_code;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'oms_logs'
      and column_name in ('numero_viaje', 'eflow_id_expedicion', 'country_id', 'company_code')
  ) then
    raise exception 'Validación sql/53: todavía quedan columnas que debían eliminarse';
  end if;
  raise notice 'Validación sql/53: OK (oms_logs adelgazada)';
end $$;

-- ROLLBACK:
-- alter table oms_logs
--   add column numero_viaje        text,
--   add column eflow_id_expedicion text,
--   add column country_id          text,
--   add column company_code        text;

commit;
