-- ============================================================================
-- 10 — Categorías oficiales de licencia de conducir de Costa Rica.
--
-- Pedido del usuario (2026-09-23): reemplazar los tipos cargados (B, A2, A4,
-- A5 — A4/A5 no existen en CR y "A2 Pesado" era incorrecto: A2 es moto) por
-- las categorías de la Ley de Tránsito 9078 relevantes para la operación:
-- motocicletas (A1–A3), vehículos de carga y livianos (B1–B4) y transporte
-- público (C1–C2). Las de maquinaria/equipo especial (D, E) se agregan desde
-- el CRUD si la operación las necesita.
--
-- Seguro: solo borra tipos que ningún conductor ni licencia referencia; el
-- resto es upsert por (country_id, code).
-- ============================================================================

begin;

delete from driver_license_types t
using countries c
where c.id = t.country_id and c.code = 'CR'
  and t.code in ('B', 'A4', 'A5')
  and not exists (select 1 from drivers d where d.license_type_id = t.id)
  and not exists (select 1 from driver_licenses l where l.driver_license_type_id = t.id);

insert into driver_license_types (country_id, code, name, description, orden, activo, vehicle_restrictions)
select c.id, v.code, v.name, v.description, v.orden, true, v.restrictions::jsonb
from countries c
cross join (values
  ('A1', 'A1 — Motocicleta hasta 125 cc', 'Bicimotos y motocicletas de hasta 125 cc.', 1,
   '{"vehicle_class": "motorcycle", "max_engine_cc": 125}'),
  ('A2', 'A2 — Motocicleta hasta 500 cc', 'Motocicletas de hasta 500 cc.', 2,
   '{"vehicle_class": "motorcycle", "max_engine_cc": 500}'),
  ('A3', 'A3 — Motocicleta de más de 500 cc', 'Motocicletas de más de 500 cc.', 3,
   '{"vehicle_class": "motorcycle"}'),
  ('B1', 'B1 — Liviano hasta 4 000 kg', 'Automóviles, pick-ups y vehículos de hasta 4 000 kg de peso bruto.', 4,
   '{"vehicle_class": "light", "max_gross_weight_kg": 4000}'),
  ('B2', 'B2 — Carga hasta 8 000 kg', 'Vehículos de carga de hasta 8 000 kg de peso bruto (camión liviano).', 5,
   '{"vehicle_class": "truck", "max_gross_weight_kg": 8000}'),
  ('B3', 'B3 — Carga pesada de más de 8 000 kg', 'Vehículos de carga de más de 8 000 kg, no articulados.', 6,
   '{"vehicle_class": "heavy_truck", "articulated": false}'),
  ('B4', 'B4 — Articulados', 'Vehículos articulados: tractocamión con semirremolque o remolque.', 7,
   '{"vehicle_class": "articulated", "articulated": true}'),
  ('C1', 'C1 — Taxi', 'Transporte público de personas en taxi.', 8,
   '{"vehicle_class": "taxi"}'),
  ('C2', 'C2 — Autobús y buseta', 'Transporte público de personas en autobús o buseta.', 9,
   '{"vehicle_class": "bus"}')
) as v(code, name, description, orden, restrictions)
where c.code = 'CR'
on conflict (country_id, code) do update
  set name = excluded.name,
      description = excluded.description,
      orden = excluded.orden,
      activo = true,
      vehicle_restrictions = excluded.vehicle_restrictions,
      updated_at = now();

commit;
