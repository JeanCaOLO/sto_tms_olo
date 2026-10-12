-- ============================================================================
-- 35 — Campos nuevos de catálogos (pedido del usuario, 2026-10-12):
--
--   carriers.contract_expiry    fecha de vencimiento del contrato del transportista
--                               (aviso 1 mes antes y al vencer).
--   carriers.contract_file_key  llave del PDF del contrato en S3 (la subida se
--                               cablea aparte; null = sin PDF).
--   carriers.rate_type          forma de pago con que se liquida al transportista;
--                               la liquidación la HEREDA (mismos valores que
--                               BaseMethodId del motor de tarifas).
--   vehicles.container_*        medidas del contenedor tal como se digitan + su
--                               unidad (cm | in | ft). No se normalizan.
--   delivery_points.contact_phone  teléfono de contacto del punto (para el chofer).
--
-- Solo agrega columnas nullable (y default de unidad): nada existente cambia.
-- ============================================================================

begin;

alter table carriers add column if not exists contract_expiry date;
alter table carriers add column if not exists contract_file_key text;
alter table carriers add column if not exists rate_type text;
alter table carriers drop constraint if exists carriers_rate_type_check;
alter table carriers add constraint carriers_rate_type_check
  check (rate_type is null or rate_type in ('PER_KM', 'PER_UNIT', 'FIXED', 'VOLUME', 'TENDERING'));

alter table vehicles add column if not exists container_width numeric;
alter table vehicles add column if not exists container_height numeric;
alter table vehicles add column if not exists container_length numeric;
alter table vehicles add column if not exists container_unit text not null default 'cm';
alter table vehicles drop constraint if exists vehicles_container_unit_check;
alter table vehicles add constraint vehicles_container_unit_check check (container_unit in ('cm', 'in', 'ft'));
alter table vehicles drop constraint if exists vehicles_container_dimensions_check;
alter table vehicles add constraint vehicles_container_dimensions_check
  check (coalesce(container_width, 1) > 0 and coalesce(container_height, 1) > 0 and coalesce(container_length, 1) > 0);

alter table delivery_points add column if not exists contact_phone text;

commit;
