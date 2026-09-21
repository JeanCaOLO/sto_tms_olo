-- ============================================================================
-- BORRADOR — NO es diseño final. Corre sobre tms_olo (Aurora PostgreSQL, AWS).
--
-- ORIGEN: notas de chat de Jean Carlo del 2026-09-16, ver
--   aidlc/spaces/default/knowledge/documents/2026-09-16-notas-jeancarlo-catalogos-tarifario-planificacion.md
--   Ese documento lista 8 preguntas SIN responder todavía (dónde vive el
--   contrato del transportista, qué significa "unificar" clientes/puntos de
--   entrega, mecánica de "tendering", etc.) — este script solo cubre las
--   partes de esas notas que tienen una interpretación razonablemente segura
--   y de bajo riesgo de reversión. Deliberadamente NO toca:
--     - el motor de costo/km (src/lib/tarifas/cost.ts) — es de Dylan, y el
--       modelo de 3 niveles (operativo/facturable/venta) de la nota necesita
--       su confirmación antes de tocar código de cálculo real.
--     - clientes/puntos de entrega "unificados" — no está claro qué significa
--       "unificar" (¿una tabla, un formulario?), así que no se fusiona nada.
--     - ruteo dinámico / prioridad de flota propia — lógica de aplicación
--       (Planificación), no schema.
--
-- Aplicado en vivo a tms_olo el 2026-09-16 como parte de esta sesión de
-- trabajo (mismo patrón ya usado para el resto del esquema migrado desde
-- Supabase: server/tms-schema.mjs, server/tms-relations.mjs).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Transportistas — cuenta para pagar + código Softland
--    (el "contrato y fecha de vencimiento" NO necesita columna nueva: la tabla
--    `contracts` ya soporta esto vía entity_type='carrier' + entity_id + end_date)
-- ----------------------------------------------------------------------------
alter table carriers
  add column if not exists payment_account text,
  add column if not exists softland_code   text;

comment on column carriers.payment_account is 'Cuenta bancaria/contable para pagar al transportista (borrador, 2026-09-16)';
comment on column carriers.softland_code   is 'Código del transportista en Softland (ERP externo) — integración aún no confirmada (borrador, 2026-09-16)';

-- ----------------------------------------------------------------------------
-- 2. Catálogo de tipos de licencia de conducir
--    drivers.license_type ya existe como texto libre (valores hoy: B, A2, A4).
--    Se agrega el catálogo + una FK nueva sin tocar ni eliminar la columna vieja.
-- ----------------------------------------------------------------------------
create table if not exists license_types (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name        text not null,
  description text,
  orden       smallint not null default 0,
  activo      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table license_types is 'Catálogo de tipos/categorías de licencia de conducir (borrador, 2026-09-16). Sembrado solo con los códigos que ya usan los conductores reales (B, A2, A4) — la lista completa CR/VE queda pendiente de validar.';

insert into license_types (code, name, orden) values
  ('B',  'B — Liviano (particular)', 1),
  ('A2', 'A2 — Pesado (carga)',      2),
  ('A4', 'A4 — Pesado articulado',   3),
  ('A5', 'A5 — Articulados',         4)
on conflict (code) do nothing;

alter table drivers
  add column if not exists license_type_id uuid references license_types(id);

update drivers d
set license_type_id = lt.id
from license_types lt
where d.license_type_id is null
  and d.license_type = lt.code;

comment on column drivers.license_type_id is 'FK a license_types (borrador, 2026-09-16). drivers.license_type (texto libre) se conserva por compatibilidad hacia atrás.';

-- ----------------------------------------------------------------------------
-- 3. Catálogo de tipos de tarifa
--    rates.rate_type ya existe como texto libre (hoy solo tiene 'standard').
--    Se agrega el catálogo + FK nueva; las filas existentes quedan con
--    tariff_type_id = NULL (no se adivina a cuál de los 5 tipos corresponde
--    'standard' — pendiente de que Dylan lo mapee).
-- ----------------------------------------------------------------------------
create table if not exists tariff_types (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name        text not null,
  description text,
  orden       smallint not null default 0,
  activo      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table tariff_types is 'Catálogo de tipos de tarifa (borrador, 2026-09-16): km, unidad, fija, volumen, tendering. "tendering" sin mecánica definida todavía — ver pregunta abierta en el documento de origen.';

insert into tariff_types (code, name, orden) values
  ('km',        'Por kilómetro', 1),
  ('unidad',    'Por unidad',    2),
  ('fija',      'Tarifa fija',   3),
  ('volumen',   'Por volumen',   4),
  ('tendering', 'Tendering (licitación)', 5)
on conflict (code) do nothing;

alter table rates
  add column if not exists tariff_type_id uuid references tariff_types(id),
  add column if not exists occupancy_pct  numeric(5,2);

comment on column rates.tariff_type_id is 'FK a tariff_types (borrador, 2026-09-16). Filas existentes (rate_type=''standard'') quedan sin mapear a propósito.';
comment on column rates.occupancy_pct  is 'Variable de % de ocupación mencionada en las notas de Jean Carlo — unidad/base de cálculo sin confirmar (volumen vs. peso). Borrador, 2026-09-16.';

-- ----------------------------------------------------------------------------
-- 4. Clientes reales de Mayoreo (Cofersa, EPA) en el catálogo de Clientes
--    NO se fusiona con "Puntos de Entrega" — ver pregunta abierta.
-- ----------------------------------------------------------------------------
insert into customers (organization_id, country_id, code, name, status)
select o.id, co.id, v.code, v.name, 'active'
from organizations o
cross join countries co
cross join (values
  ('COFERSA', 'Cofersa'),
  ('EPA',     'EPA')
) as v(code, name)
where o.name = 'Transportes OLO'
  and co.code = 'CR' -- Mayoreo/Cofersa/EPA son de Costa Rica per OMS_ESPECIFICACION_DETALLADA.md §4
  and not exists (
    select 1 from customers c where c.code = v.code
  );

comment on table customers is 'Incluye Cofersa/EPA como clientes reales desde 2026-09-16 (antes solo existían como fuentes de datos/reglas del OMS, no como filas de este catálogo).';
