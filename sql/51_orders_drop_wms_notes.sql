-- ============================================================================
-- 51 — Borrar la columna orders.wms_notes (sin uso).
--
-- sql/43 creó `wms_notes` (EFLOW OBSERVACIONESEXPEDICION) como columna separada,
-- pero la carga real escribe el texto del cliente/vendedor en `observaciones`:
-- en el sandbox `wms_notes` tiene 0 filas con datos y `observaciones` 240. El
-- backend del OMS (cola_candidatos.py) y Planificación ya leen `observaciones`;
-- la UI leía `wms_notes` por error (observaciones siempre vacías) — ya corregido
-- en src/pages/oms/api/omsApi.ts para leer `observaciones`.
--
-- `wms_notes` queda huérfana y se elimina. `observaciones` es la única fuente.
--
-- Uso:  node --env-file=.env scripts/run-migration.mjs sql/51_...sql            (dry-run)
--       node --env-file=.env scripts/run-migration.mjs sql/51_...sql --execute
-- ============================================================================

begin;

alter table orders drop column if exists wms_notes;

do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'orders'
               and column_name = 'wms_notes') then
    raise exception 'Validación sql/51: orders.wms_notes todavía existe';
  end if;
  raise notice 'Validación sql/51: OK (wms_notes eliminada)';
end $$;

-- ROLLBACK (re-crea la columna vacía; los datos no se recuperan, no había):
-- alter table orders add column if not exists wms_notes text;
-- comment on column orders.wms_notes is
--   'EFLOW OBSERVACIONESEXPEDICION (texto del cliente/vendedor; lo analiza la regla de observaciones). notes es para notas del TMS.';

commit;
