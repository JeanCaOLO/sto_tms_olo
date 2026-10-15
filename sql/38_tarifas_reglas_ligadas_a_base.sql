-- ============================================================================
-- 38 — Forma de cobro de la BASE y ajustes ligados a ella (refactor del tarifador, 2026-10-15).
--
--   tarifas_pricing_rules.base_method      text   forma de cobro que DECLARA una regla BASE
--       ('PER_KM' | 'PER_UNIT' | 'FIXED' | 'VOLUME'). Solo etapa BASE; NULL en las demás. El
--       backfill la deduce de la expresión igual que el motor (`classifyExpr`, nivel superior);
--       las reglas con expresión compuesta (CLAMP/MIN/MAX/IF) o sin clasificar quedan en NULL y
--       el motor las sigue deduciendo de la fórmula. TENDERING no se admite todavía.
--
--   tarifas_pricing_rules.applies_to_base  jsonb  arreglo de formas de cobro a las que está
--       ligado un ajuste (recargo, descuento, modificador…). El motor lo aplica solo cuando la
--       base del viaje es una de ellas. NULL o [] = transversal: aplica con cualquier base, que
--       es como se comportaban todas las reglas hasta hoy (no hace falta backfill).
--
-- Idempotente. Solo agrega columnas nullable: no cambia el resultado de ninguna regla existente.
-- Ejecutarlo en la base es decisión de quien administra la BD; el despliegue lo hace Intelix.
-- ============================================================================

begin;

alter table tarifas_pricing_rules add column if not exists base_method text;
alter table tarifas_pricing_rules drop constraint if exists tarifas_pricing_rules_base_method_check;
alter table tarifas_pricing_rules add constraint tarifas_pricing_rules_base_method_check
  check (
    base_method is null
    or (stage = 'BASE' and base_method in ('PER_KM', 'PER_UNIT', 'FIXED', 'VOLUME'))
  );

alter table tarifas_pricing_rules add column if not exists applies_to_base jsonb;
alter table tarifas_pricing_rules drop constraint if exists tarifas_pricing_rules_applies_to_base_check;
alter table tarifas_pricing_rules add constraint tarifas_pricing_rules_applies_to_base_check
  check (
    applies_to_base is null
    or (
      jsonb_typeof(applies_to_base) = 'array'
      and applies_to_base <@ '["PER_KM","PER_UNIT","FIXED","VOLUME","TENDERING"]'::jsonb
    )
  );

-- Backfill de las BASE a partir de la expresión (misma clasificación que classifyExpr, nivel superior).
update tarifas_pricing_rules
set base_method = case
  when expression->>'op' = 'PER_KM' then 'PER_KM'
  when expression->>'op' in ('PER_UNIT', 'TIERED', 'PER_BLOCK') and expression->>'unit' = 'km' then 'PER_KM'
  when expression->>'op' in ('PER_UNIT', 'TIERED', 'PER_BLOCK') and expression->>'unit' = 'truckVolumeM3' then 'VOLUME'
  when expression->>'op' in ('PER_UNIT', 'TIERED', 'PER_BLOCK') then 'PER_UNIT'
  when expression->>'op' in ('FIXED', 'LOOKUP_TABLE') then 'FIXED'
end
where stage = 'BASE' and base_method is null;

comment on column tarifas_pricing_rules.base_method is
  'Forma de cobro que declara una regla BASE (NULL = se deduce de la expresión). Solo etapa BASE.';
comment on column tarifas_pricing_rules.applies_to_base is
  'Formas de cobro de la base a las que está ligado el ajuste (NULL o [] = aplica con cualquier base). Solo etapas que no son BASE.';

commit;
