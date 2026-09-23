-- ============================================================================
-- 12 — Zona y ruta en los puntos de entrega.
--
-- Para la ingesta de puntos de entrega de Cofersa (2026-09-23), cada punto
-- trae del WMS su RUTA (código numérico = zones.code, ej. "06") y su ZONA
-- WMS (código fino tipo "Z017"). Se guardan en el punto de entrega:
--   zone_id        -> zones (resuelta por la ruta; null si la ruta no existe
--                     en el catálogo de zonas, ej. rutas 17-39 hoy)
--   route_code     -> código de ruta tal como viene del WMS (siempre)
--   wms_zone_code  -> código de zona del WMS tal como viene (ej. "Z017")
-- Además, un código externo no se repite dentro del mismo cliente final
-- (permite reingestas idempotentes).
--
-- Nunca destructivo: solo agrega columnas e índices.
-- ============================================================================

begin;

alter table delivery_points add column if not exists zone_id uuid references zones(id);
alter table delivery_points add column if not exists route_code text;
alter table delivery_points add column if not exists wms_zone_code text;

create index if not exists delivery_points_zone_id_idx on delivery_points (zone_id);
create unique index if not exists delivery_points_final_customer_external_code_key
  on delivery_points (final_customer_id, external_code) where external_code is not null;

commit;
