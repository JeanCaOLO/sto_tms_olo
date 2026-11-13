-- ============================================================================
-- 66 — País de cada vehículo (tbl_vehicles.country_id), para planificar por país (2026-11-13).
--
-- El motor de ruteo de Planificación arma los viajes con la flota propia
-- (carrier_id IS NULL). Hasta hoy la tomaba de TODA la organización, así que un plan
-- de Venezuela habría usado los camiones de Costa Rica. Con esta columna,
-- plan_builder._FLOTA filtra por el país del almacén (tbl_warehouses.country_id).
--
-- Relleno inicial:
--   - Vehículos de un transportista: el país del transportista (tbl_carriers.country_id).
--   - Flota propia (sin transportista): Costa Rica (code 'CR') de su organización.
--     SUPUESTO: al 2026-11-13 la flota propia son 12 camiones y todos operan en Costa
--     Rica (placas CL…/C…). Si alguno es de otro país, corregirlo con un UPDATE.
--
-- Columna nullable: un vehículo nuevo sin país NO entra en la planificación de ningún
-- almacén (el planificador responde 409 si el país se queda sin flota propia). La
-- pantalla de vehículos debe pedir el país (pendiente del frontend).
--
-- La vista de compatibilidad public.vehicles (sql/59) es `select *` y NO expone la
-- columna nueva hasta recrearse; no se toca aquí porque el backend lee tbl_vehicles.
--
-- Aplicar con: node --env-file=.env.local scripts/run-migration.mjs sql/66_vehiculos_pais.sql [--execute]
-- Deshacer con: sql/66_vehiculos_pais_rollback.sql
-- Idempotente.
-- ============================================================================

begin;

alter table tbl_vehicles add column if not exists country_id uuid;
alter table tbl_vehicles drop constraint if exists fk_vehicles_country_id;
alter table tbl_vehicles
  add constraint fk_vehicles_country_id
  foreign key (country_id) references tbl_countries (id);
create index if not exists idx_vehicles_country_id on tbl_vehicles (country_id);

comment on column tbl_vehicles.country_id is
  'Pais donde opera el vehiculo. Planificacion arma los viajes de un almacen solo con la flota propia de su pais (sql/66).';

-- Relleno: transportista → su país.
update tbl_vehicles v
   set country_id = ca.country_id, updated_at = now()
  from tbl_carriers ca
 where ca.id = v.carrier_id and v.country_id is null and ca.country_id is not null;

-- Relleno: flota propia → Costa Rica de su organización (ver SUPUESTO arriba).
update tbl_vehicles v
   set country_id = c.id, updated_at = now()
  from tbl_countries c
 where v.carrier_id is null and v.country_id is null
   and c.organization_id = v.organization_id and c.code = 'CR';

-- Validación: la flota propia activa quedó con país.
do $$
declare sin_pais int;
begin
  select count(*) into sin_pais from tbl_vehicles where carrier_id is null and status = 'active' and country_id is null;
  if sin_pais > 0 then
    raise exception '66: % vehiculos propios activos quedaron sin pais', sin_pais;
  end if;
end $$;

commit;
