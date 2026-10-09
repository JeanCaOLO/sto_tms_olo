-- ============================================================================
-- 31 — Reglas globales de Costa Rica para el cambio de base al liquidar.
--
-- 1) Desactiva TODAS las reglas de tarifa existentes (no borra nada: se pueden reactivar).
-- 2) Crea 4 reglas BASE de alcance COUNTRY (Costa Rica; aplican a todas las compañías), una por
--    tipo de cobro que el liquidador puede elegir en "Cambiar base": kilómetro, unidad (parada),
--    volumen y tarifa fija. Son EXCLUSIVE: por defecto gana la de menor prioridad (km); las demás
--    solo se vuelven la base cuando el liquidador la elige.
--
-- Importes en colones (CRC), derivados de la estructura de costos de la FLOTA PROPIA de Costa Rica
-- (sql/04_costeo_base_costa_rica.sql, docs/reference/estructura-costos-transporte.md), camión T3
-- (3–4.5 Ton, 28 m³, 6.0 km/L). Las cuatro reglas equivalen al mismo día de trabajo de referencia:
--
--   Supuestos: 150 km/día, 12 paradas/día, 25 % de margen, +25 % de km facturables por km vacíos,
--              85 % de ocupación de la capacidad (factor_ocupacion).
--   Costo fijo diario ............ ₡57 525.70   (conductor + ayudante + depreciación, ÷ 30 días)
--   Diésel ....................... ₡635 / 6.0   = ₡105.83 / km
--   Mantenimiento (T3) ........... ₡48.81 / km
--   Costo operativo del día ...... 57 525.70 + 150 × (105.83 + 48.81) = ₡80 721 (₡538.14 / km)
--   Costo facturable del día ..... 80 721 × 1.25 = ₡100 901   (ajustado por km vacíos)
--   Tarifa de venta del día ...... 100 901 ÷ (1 − 0.25) = ₡134 535
--
--   Por kilómetro ... 134 535 / 150 km ............ ₡897
--   Por parada ...... 134 535 / 12 paradas ........ ₡11 211  -> ₡11 200
--   Por m³ .......... 134 535 / (28 m³ × 0.85) .... ₡5 653   -> ₡5 650
--   Tarifa fija ..... 134 535 por viaje ........... ₡135 000
--
-- Los supuestos (km/día, paradas, margen) son ajustables: se editan desde Reglas Tarifa. Aditiva e
-- idempotente (ids fijos + ON CONFLICT DO NOTHING).
-- ============================================================================

update tarifas_pricing_rules set active = false where active;

insert into tarifas_pricing_rules (
  id, country_id, scope, party_id, code, name, stage, priority, stacking, exclusion_group,
  conditions, expression, description, reason, effect, builder, condition_builder,
  is_adhoc, active, effective_from, effective_to, version
)
select
  r.id, c.id, 'COUNTRY', null, r.code, r.name, 'BASE', r.priority, 'EXCLUSIVE', null,
  '{"p":"ALWAYS"}'::jsonb, r.expression::jsonb, r.description, r.description, 'INCREASE', r.builder::jsonb, null,
  false, true, null, null, 1
from countries c
cross join (values
  ('RULE_CR_GLOBAL_BASE_KM', 'BASE_KM_CR', 'Base por kilómetro (Costa Rica)', 10,
   '{"op":"PER_KM","rate":"897.00"}',
   'Base por kilómetro, flota propia CR (camión T3): ₡897 por km recorrido.',
   '{"variable":"km","operator":"TIMES","value":"897.00","effect":"INCREASE"}'),
  ('RULE_CR_GLOBAL_BASE_UNIDAD', 'BASE_UNIDAD_CR', 'Base por parada atendida (Costa Rica)', 20,
   '{"op":"PER_UNIT","unit":"clientCount","rate":"11200.00"}',
   'Base por unidad, flota propia CR (camión T3): ₡11 200 por parada o cliente atendido.',
   '{"variable":"clientCount","operator":"TIMES","value":"11200.00","effect":"INCREASE"}'),
  ('RULE_CR_GLOBAL_BASE_VOLUMEN', 'BASE_VOLUMEN_CR', 'Base por volumen del camión (Costa Rica)', 30,
   '{"op":"PER_UNIT","unit":"truckVolumeM3","rate":"5650.00"}',
   'Base por volumen, flota propia CR (camión T3): ₡5 650 por m³ de capacidad del camión.',
   '{"variable":"truckVolumeM3","operator":"TIMES","value":"5650.00","effect":"INCREASE"}'),
  ('RULE_CR_GLOBAL_BASE_FIJA', 'BASE_FIJA_CR', 'Base tarifa fija por viaje (Costa Rica)', 40,
   '{"op":"FIXED","amount":"135000.00"}',
   'Base tarifa fija, flota propia CR (camión T3): ₡135 000 por viaje, sin importar km ni paradas.',
   '{"variable":null,"operator":"FIXED","value":"135000.00","effect":"INCREASE"}')
) as r(id, code, name, priority, expression, description, builder)
where c.code = 'CR'
on conflict (id) do nothing;
