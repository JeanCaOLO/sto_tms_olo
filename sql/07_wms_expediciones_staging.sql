-- ============================================================================
-- Tabla de staging que espeja la vista real "Expediciones (Salidas)" del WMS
-- (ver docs/arquitectura-tms-oms/ y las capturas de pantalla del WMS real
-- compartidas 2026-09-22: Id Compañía, Id Sucursal, Expedición, Tipo
-- Expedición, Estado, Situación, Avance %, Ruta, Cliente, Nombre Cliente,
-- Cant. Líneas, Muelle Asignado, más los campos del diálogo de filtros:
-- Fecha de Expedición, Fecha Planificada, Prioridad, NúmeroViaje WMH,
-- Observaciones).
--
-- Esta es la tabla que el OMS (Fase 5/6 del roadmap,
-- docs/arquitectura-tms-oms/05-roadmap.md) debe leer para armar la Cola de
-- Priorización, en vez de src/pages/oms/mockData.ts. NO es la tabla final
-- de ejecución del TMS (esa sigue siendo `orders`/`routes`) — es la capa de
-- INGESTA cruda desde el WMS, antes de normalización/reglas/prioridad.
--
-- Nunca destructivo: tabla nueva, no toca nada existente.
-- ============================================================================

begin;

create table if not exists wms_expediciones (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  warehouse_id uuid not null references warehouses(id),

  -- Identidad de la expedición en el WMS real (nunca se regenera; es la
  -- clave natural que usaríamos para upsert cuando exista integración real).
  id_compania text not null,        -- '0109' COFERSA, '0029' EPA, etc.
  id_sucursal text not null default '0001',
  expedicion text not null,          -- número de expedición del WMS (varios formatos reales: '2000018103', 'PL0000003081-M', 'VS032753-O')
  tipo_expedicion text not null,     -- EXPERP | EXPCRO | EXPMAN | EXPTRA (ver docs/guides/eflow-fuentes-reales.md)

  estado text not null,              -- DISP, BLOQ, ... (WMS)
  situacion text not null,           -- GENE | DISP | PREP | ... — el OMS solo LEE/CAMBIA esto (+estado), nunca la fecha
  avance_pct numeric not null default 0,

  ruta text,                          -- código de ruta del WMS (puede venir vacío hasta que Planificación/TMS lo asigne)
  cliente_code text not null,         -- código de cliente del WMS (para EPA: código de tienda tipo 'T002'; para COFERSA: código de cliente final)
  nombre_cliente text not null,
  final_customer_id uuid references final_customers(id), -- resuelto cuando el cliente WMS ya está onboardeado en el TMS; NULL si aún no

  cant_lineas integer not null default 0,
  muelle_asignado text,

  fecha_expedicion date,
  fecha_planificada date,             -- "fecha de expedición planificada" — el OMS la LEE como insumo, nunca la escribe
  prioridad integer,                  -- numérica, menor = más urgente (ya DECIDED en project.md)
  numero_viaje_wmh text,              -- FK lógica a journeys.journey_id de EFLOW_WMH (no hay integración real todavía)
  observaciones text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists wms_expediciones_warehouse_id_idx on wms_expediciones (warehouse_id);
create index if not exists wms_expediciones_id_compania_idx on wms_expediciones (id_compania);
create index if not exists wms_expediciones_situacion_idx on wms_expediciones (situacion);
create unique index if not exists wms_expediciones_natural_key on wms_expediciones (warehouse_id, id_compania, id_sucursal, expedicion);

commit;
