-- Estructura de costos v2 (ver docs/tarifador/ROADMAP.md §8.8 y src/lib/tarifas/data/schema.ts).
--
--   * Una sola fuente de costo de la flota propia: la estructura por filas. Las tres tasas fijas por
--     país (`tarifas_own_cost_params`) desaparecen; el país tiene una estructura por defecto
--     (`party_id` nulo) que la usa la flota propia sin estructura propia.
--   * La estructura guarda sus parámetros (km por año, precio del combustible, rendimiento por camión).
--   * Una fila puede ser un componente que se repite (frecuencia + cada cuánto + costo por km) y
--     puede ser de un solo tipo de camión.
--
-- Idempotente. NO borra datos: si `tarifas_own_cost_params` tuviera filas, se detiene para no
-- perder costos que alguien cargó; convertirlas a filas de la estructura del país antes de seguir.

ALTER TABLE tarifas_cost_structures ALTER COLUMN party_id DROP NOT NULL;
ALTER TABLE tarifas_cost_structures
  ADD COLUMN IF NOT EXISTS params jsonb NOT NULL
  DEFAULT '{"kmPerYear": null, "fuelPrice": null, "fuelEfficiency": {}}'::jsonb;

ALTER TABLE tarifas_cost_structure_rows
  ADD COLUMN IF NOT EXISTS cost_group text,
  ADD COLUMN IF NOT EXISTS frequency text,
  ADD COLUMN IF NOT EXISTS frequency_qty numeric,
  ADD COLUMN IF NOT EXISTS unit_qty numeric,
  ADD COLUMN IF NOT EXISTS cost_per_km numeric,
  ADD COLUMN IF NOT EXISTS truck_type text;

DO $$
BEGIN
  IF to_regclass('tarifas_own_cost_params') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM tarifas_own_cost_params) THEN
      RAISE EXCEPTION 'tarifas_own_cost_params tiene filas: conviértalas a filas de la estructura del país antes de eliminarla';
    END IF;
    DROP TABLE tarifas_own_cost_params;
  END IF;
END $$;
