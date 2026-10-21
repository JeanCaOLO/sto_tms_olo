-- ============================================================================
-- 11 — Detalle (líneas) de las expediciones del WMS/eFlow  [BORRADOR / SIM]
--
-- Qué resuelve: hoy el staging de eFlow (`wms_expediciones`, ver 07) solo tiene
-- la CABECERA + `cant_lineas` (un número), NO las líneas. Para:
--   (a) el caso EPA (prioridad POR LÍNEA: falla vs regular), y
--   (b) simular el flujo nuevo sin tocar el eFlow real,
-- falta la tabla de DETALLE. Esta es esa tabla.
--
-- Uso como SIMULACIÓN (reunión 2026-10-15 con Antonio):
--   - La API simulada de eFlow (eflow-sim) LEE de aquí (cabecera + detalle).
--   - El módulo de Planificación "escribe el número de viaje a eFlow" haciendo
--     UPDATE wms_expediciones.numero_viaje_wmh (esa columna YA existe en 07).
--     NO se escribe en el eFlow real: se simula contra este staging de Aurora.
--
-- Nunca destructivo: tablas/columnas nuevas, `if not exists`, no toca `orders`
-- ni `order_items` ni nada existente. Reversible con DROP.
-- Pendiente de la reunión con Jean: decidir si esto se queda como staging o si
-- las líneas/prioridad/trazabilidad se promueven al modelo final.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1) Detalle de expedición = líneas/artículos de un pedido del WMS/eFlow.
--    Espeja EXPEDICIONESDETALLE / ARTICULOSGESTION. Clave natural por línea.
-- ---------------------------------------------------------------------------
create table if not exists wms_expediciones_detalle (
  id uuid primary key default gen_random_uuid(),
  expedicion_id uuid not null references wms_expediciones(id) on delete cascade,

  id_linea integer not null,            -- nº de línea dentro de la expedición
  id_articulo text,                     -- SKU / código de artículo
  descripcion text,
  cantidad numeric,
  peso numeric,                         -- kg de la línea (suma → peso del stop)
  volumen numeric,                      -- m3 de la línea
  guia_fiscal text,

  -- Prioridad POR LÍNEA — clave para EPA. Numérica, menor = más urgente
  -- (coherente con project.md). En EPA, IPRAC ya parte el pedido en dos
  -- expediciones (-0 falla / -1 regular), así que en la práctica todas las
  -- líneas de una misma expedición comparten prioridad; la columna igual vive
  -- a nivel línea por si llegara mezclada. NULL = sin prioridad asignada.
  prioridad integer,

  estado text,                          -- espejo del estado de la línea en eFlow (DISP, ...)
  situacion text,                       -- GENE | DISP | ... (lo que el OMS pone en 'generada')

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists wms_exp_detalle_expedicion_idx on wms_expediciones_detalle (expedicion_id);
create index if not exists wms_exp_detalle_articulo_idx on wms_expediciones_detalle (id_articulo);
create index if not exists wms_exp_detalle_prioridad_idx on wms_expediciones_detalle (prioridad);
create unique index if not exists wms_exp_detalle_natural_key
  on wms_expediciones_detalle (expedicion_id, id_linea);

-- ---------------------------------------------------------------------------
-- 2) Marca de trazabilidad del "write-back" del número de viaje.
--    `numero_viaje_wmh` ya existe en wms_expediciones (07). Agregamos solo el
--    sello de CUÁNDO lo escribió el TMS/Planificación, para distinguir el viaje
--    asignado por nosotros del que venía del WMH y poder auditar la simulación.
-- ---------------------------------------------------------------------------
alter table wms_expediciones
  add column if not exists viaje_asignado_at timestamptz,          -- cuándo el TMS escribió numero_viaje_wmh
  add column if not exists viaje_asignado_por text;                -- 'planificacion-tms' | 'wmh' | NULL

comment on column wms_expediciones.numero_viaje_wmh is
  'Número de viaje. A futuro lo ESCRIBE el TMS/Planificación (no el WMH). En la simulación se actualiza por UPDATE desde la API eflow-sim.';

commit;

-- ============================================================================
-- NO incluido aquí a propósito (va a la reunión con Jean, decisión de modelo):
--   - Trazabilidad eFlow <-> pedido planificado: llaves de expedición
--     (expedicion/id_compania/id_almacen/id_sucursal, estado/situacion) en
--     `orders`/`order_items`, o una FK orders.expedicion_id -> wms_expediciones.
--   - `orders.priority` está como varchar: pasar a numérica (ya DECIDED).
--   - Modelo de parada/viaje a nivel LÍNEA (si alguna vez una línea del mismo
--     pedido cae en otro viaje/fecha). Hoy plan_stops es por pedido completo.
-- Para revertir esta migración:
--   drop table if exists wms_expediciones_detalle;
--   alter table wms_expediciones drop column if exists viaje_asignado_at,
--     drop column if exists viaje_asignado_por;
-- ============================================================================
