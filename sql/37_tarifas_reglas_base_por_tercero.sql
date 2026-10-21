-- ============================================================================
-- 37 — Reglas BASE por transportista tercero, una por cada forma de cobro del catálogo.
--
-- La base de un tercero ya no se elige al liquidar: la define carriers.rate_type
-- (PER_KM | PER_UNIT | FIXED | VOLUME). Para que cada selección del catálogo calcule, cada
-- transportista TERCERO (is_flota_propia = false) tiene su perfil de cálculo y 4 reglas BASE de
-- alcance PARTY, una por forma de cobro calculable. TENDERING no tiene fórmula todavía.
--
-- Importes: los de las reglas globales de CR (sql/31), copiados para que cada tercero los pueda
-- ajustar sin tocar a los demás. La tarifa fija toma carriers.flat_rate_amount si existe.
--
-- 1) Crea el perfil de cálculo (tarifas_settlement_parties) de cada tercero que no lo tenga.
-- 2) Crea las reglas que falten (ids fijos por transportista, idempotente).
-- 3) ACTIVA las reglas BASE de tercero que ya existían desactivadas.
-- Flota propia no se toca: siempre se calcula con su estructura de costos.
-- ============================================================================

insert into tarifas_settlement_parties (id, carrier_id, status, notes)
select 'party_' || c.id::text, c.id, 'active', 'Perfil creado por sql/37 (reglas BASE por tercero)'
from carriers c
where coalesce(c.is_flota_propia, false) = false
on conflict (carrier_id) do nothing;

insert into tarifas_pricing_rules (
  id, country_id, scope, party_id, code, name, stage, priority, stacking, exclusion_group,
  conditions, expression, description, reason, effect, builder, condition_builder,
  is_adhoc, active, effective_from, effective_to, version
)
select
  'RULE_PARTY_' || r.suffix || '_' || p.carrier_id::text,
  coalesce(c.country_id, (select id from countries where code = 'CR')),
  'PARTY', p.id,
  r.code || '_' || coalesce(c.code, p.carrier_id::text),
  r.name || ' — ' || c.name,
  'BASE', r.priority, 'EXCLUSIVE', null,
  '{"p":"ALWAYS"}'::jsonb,
  case when r.suffix = 'FIJA' and c.flat_rate_amount is not null
       then jsonb_build_object('op', 'FIXED', 'amount', to_char(c.flat_rate_amount, 'FM999999999990.00'))
       else r.expression::jsonb end,
  r.description, r.description, 'INCREASE',
  case when r.suffix = 'FIJA' and c.flat_rate_amount is not null
       then jsonb_build_object('variable', null, 'operator', 'FIXED',
                               'value', to_char(c.flat_rate_amount, 'FM999999999990.00'), 'effect', 'INCREASE')
       else r.builder::jsonb end,
  null, false, true, null, null, 1
from tarifas_settlement_parties p
join carriers c on c.id = p.carrier_id
cross join (values
  ('KM', 'BASE_KM', 'Base por kilómetro', 10,
   '{"op":"PER_KM","rate":"897.00"}',
   'Forma de cobro por kilómetro recorrido del transportista tercero.',
   '{"variable":"km","operator":"TIMES","value":"897.00","effect":"INCREASE"}'),
  ('UNIDAD', 'BASE_UNIDAD', 'Base por parada atendida', 20,
   '{"op":"PER_UNIT","unit":"clientCount","rate":"11200.00"}',
   'Forma de cobro por unidad (parada o cliente atendido) del transportista tercero.',
   '{"variable":"clientCount","operator":"TIMES","value":"11200.00","effect":"INCREASE"}'),
  ('VOLUMEN', 'BASE_VOLUMEN', 'Base por volumen del camión', 30,
   '{"op":"PER_UNIT","unit":"truckVolumeM3","rate":"5650.00"}',
   'Forma de cobro por volumen (m³ de capacidad del camión) del transportista tercero.',
   '{"variable":"truckVolumeM3","operator":"TIMES","value":"5650.00","effect":"INCREASE"}'),
  ('FIJA', 'BASE_FIJA', 'Base tarifa fija por viaje', 40,
   '{"op":"FIXED","amount":"135000.00"}',
   'Forma de cobro de tarifa fija por viaje del transportista tercero.',
   '{"variable":null,"operator":"FIXED","value":"135000.00","effect":"INCREASE"}')
) as r(suffix, code, name, priority, expression, description, builder)
where coalesce(c.is_flota_propia, false) = false
on conflict (id) do nothing;

-- Las reglas BASE de tercero que ya existían (creadas a mano o por un seed) y quedaron apagadas.
update tarifas_pricing_rules r
set active = true
from tarifas_settlement_parties p
join carriers c on c.id = p.carrier_id
where r.party_id = p.id
  and r.scope = 'PARTY'
  and r.stage = 'BASE'
  and r.active = false
  and coalesce(c.is_flota_propia, false) = false;
