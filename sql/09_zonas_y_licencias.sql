-- ============================================================================
-- 09 — Catálogo de Zonas (antes "tipos de ruta") y licencias por país.
--
-- Decisión del usuario (2026-09-23): el catálogo de rutas pasa a ser un
-- Catálogo de Zonas; lo que hoy son "tipos de ruta" SON las zonas, y cada zona
-- pertenece a un país (todas las existentes son de Costa Rica). La sección
-- "Rutas" de la UI se elimina; la tabla `routes` (los VIAJES) NO se toca.
--
-- 1. route_types se RENOMBRA a zones (mismas filas e ids: orders.route_type_id
--    y routes.route_type_id siguen apuntando a la misma tabla; las FK se mueven
--    solas con el renombre). Se agregan country_id (obligatorio) y code.
-- 2. Vista de compatibilidad `route_types` para que Tarifas, Liquidaciones,
--    Tracking y el Express legado sigan leyendo mientras se migran.
--    Retirarla cuando ningún código la use.
-- 3. driver_license_types: el código es único POR PAÍS (no global) y el país
--    es obligatorio.
--
-- Supera al diseño de `zones` de sql/01_fase1_zonas_reglas.sql, que nunca se
-- aplicó. Nunca destructivo: no borra filas.
-- ============================================================================

begin;

-- 1. Zonas ------------------------------------------------------------------
alter table route_types rename to zones;
alter table zones rename constraint route_types_pkey to zones_pkey;
alter table zones rename constraint route_types_status_check to zones_status_check;
alter table zones rename constraint route_types_organization_id_fkey to zones_organization_id_fkey;

alter table zones add column if not exists country_id uuid references countries(id);
alter table zones add column if not exists code text;

update zones z
set country_id = c.id
from countries c
where z.country_id is null and c.code = 'CR' and c.organization_id = z.organization_id;

-- Código = prefijo numérico del nombre ("01 · Casco Central" -> "01"); es el
-- código de ruta del WMS (wms_expediciones.ruta). GAM/Rural quedan sin código.
update zones
set code = substring(name from '^\s*(\d+)\s*·')
where code is null and name ~ '^\s*\d+\s*·';

alter table zones alter column country_id set not null;

create unique index if not exists zones_country_code_key
  on zones (country_id, code) where code is not null;
create index if not exists zones_country_id_idx on zones (country_id);

-- 2. Compatibilidad ---------------------------------------------------------
-- Vista simple = auto-actualizable en PostgreSQL. Un INSERT por aquí falla
-- porque no trae country_id (obligatorio): las altas van contra `zones`.
create view route_types as
  select id, name, status, organization_id, created_at, updated_at, country_id, code
  from zones;

comment on view route_types is
  'Compatibilidad: route_types fue renombrada a zones (sql/09). Usar zones.';

-- 3. Licencias --------------------------------------------------------------
alter table driver_license_types drop constraint if exists license_types_code_key;
alter table driver_license_types alter column country_id set not null;
create unique index if not exists driver_license_types_country_code_key
  on driver_license_types (country_id, code);

commit;
