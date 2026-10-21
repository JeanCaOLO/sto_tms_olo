-- ============================================================================
-- 44 — Maestros EFLOW, paso 4: order_items = EFLOW EXPEDICIONESDETALLE.
--
-- Plan: docs/work/2026-10/2026-10-16-plan-modelo-pedidos-clientes-eflow.md
-- (paso 4). DDL de origen: docs/wms-eflow/EFLOW_OLO-ddl.sql.
--
-- Llave de EFLOW: la del pedido (orders.uq_order_eflow_key) + IDEXPEDICIONLINEA.
-- Aquí: order_id + line_number, única.
--
-- Mapeo (columnas existentes y nuevas):
--   IDEXPEDICIONLINEA   -> line_number (nueva, obligatoria)
--   IDARTICULO          -> product_code (existente)
--   (ARTICULOSGESTION)  -> product_name (existente; pasa a aceptar NULL: el
--                          detalle de EFLOW no trae el nombre del artículo)
--   IDPRESENTACION      -> presentation (nueva)
--   LOTEEXPECIFICO      -> lot (nueva)
--   UNIDADESPEDIDAS     -> quantity (existente)
--   UNIDADESPREPARADAS  -> quantity_prepared (nueva)
--   UNIDADESCARGADAS    -> quantity_loaded (nueva)
--   UNIDADESANULADAS    -> quantity_cancelled (nueva)
--   PESOPEDIDO          -> weight (existente)
--   CUBICAJEPEDIDO      -> volume (existente; numeric(10,2) -> numeric(12,4):
--                          los m³ por línea son decimales chicos. Ninguna vista
--                          usa order_items.volume)
--   GUIAFISCAL          -> guia_fiscal (existente, sql/19 + ADR-0004; no se renombra)
--   FECHACADUCIDAD      -> expiry_date (nueva)
--   TPEXES / TPEXSI     -> wms_status / wms_situation (nuevas)
--   OBSERVACIONES       -> notes (nueva)
-- Fuera (no los usa el OMS/TMS): UNIDADESPROBLEMAS, PESO/CUBICAJE/VALORPREPARADO,
-- PREPARARMAS/MENOS, REF1..3, BONIFICADO, DUA, IDTARIMA, CONTENEDOR, INCIDENCIA_*, etc.
--
-- Backfill: line_number = orden de creación de las líneas de cada pedido.
--
-- AFECTA A OTROS EQUIPOS (notificados): todo INSERT en order_items debe mandar
-- line_number. Scripts conocidos: agregar_pedidos_reales.py,
-- agregar_viajes_para_recalcular.js, scripts/seed-guias-despacho-demo.mjs.
--
-- Nomenclatura: estándar OLTP INTELIX. Excepciones: trigger audit_row_change
-- (sql/16) y guia_fiscal (columna de Planificación, ADR-0004).
--
-- Uso:  node --env-file=.env scripts/run-migration.mjs sql/44_...sql            (dry-run)
--       node --env-file=.env scripts/run-migration.mjs sql/44_...sql --execute
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Columnas nuevas
-- ---------------------------------------------------------------------------
alter table order_items
  add column if not exists line_number        integer,
  add column if not exists presentation       varchar(6),
  add column if not exists lot                varchar(30),
  add column if not exists quantity_prepared  integer,
  add column if not exists quantity_loaded    integer,
  add column if not exists quantity_cancelled integer,
  add column if not exists expiry_date        date,
  add column if not exists wms_status         varchar(6),
  add column if not exists wms_situation      varchar(6),
  add column if not exists notes              text;

comment on table order_items is 'Líneas del pedido. Equivale a EFLOW EXPEDICIONESDETALLE (PK = la de EXPEDICIONESCABECERA + IDEXPEDICIONLINEA).';
comment on column order_items.line_number        is 'EFLOW IDEXPEDICIONLINEA. Único por pedido.';
comment on column order_items.product_code       is 'EFLOW IDARTICULO.';
comment on column order_items.product_name       is 'Nombre del artículo (EFLOW ARTICULOSGESTION; el detalle no lo trae).';
comment on column order_items.presentation       is 'EFLOW IDPRESENTACION.';
comment on column order_items.lot                is 'EFLOW LOTEEXPECIFICO.';
comment on column order_items.quantity           is 'EFLOW UNIDADESPEDIDAS.';
comment on column order_items.quantity_prepared  is 'EFLOW UNIDADESPREPARADAS.';
comment on column order_items.quantity_loaded    is 'EFLOW UNIDADESCARGADAS.';
comment on column order_items.quantity_cancelled is 'EFLOW UNIDADESANULADAS.';
comment on column order_items.weight             is 'EFLOW PESOPEDIDO.';
comment on column order_items.volume             is 'EFLOW CUBICAJEPEDIDO (m³).';
comment on column order_items.expiry_date        is 'EFLOW FECHACADUCIDAD.';
comment on column order_items.wms_status         is 'EFLOW TPEXES (estado de la línea en el WMS).';
comment on column order_items.wms_situation      is 'EFLOW TPEXSI (situación de la línea en el WMS).';
comment on column order_items.notes              is 'EFLOW OBSERVACIONES de la línea.';

-- ---------------------------------------------------------------------------
-- 2. Backfill de line_number y llave
-- ---------------------------------------------------------------------------
update order_items oi
set line_number = n.rn
from (select id, row_number() over (partition by order_id order by created_at nulls last, id) as rn
      from order_items) n
where n.id = oi.id and oi.line_number is null;

alter table order_items alter column line_number set not null;
alter table order_items add constraint uq_order_item_order_line unique (order_id, line_number);
alter table order_items add constraint ck_order_item_line_number check (line_number >= 1);

alter table order_items alter column product_name drop not null;
alter table order_items alter column volume type numeric(12,4);

-- ---------------------------------------------------------------------------
-- 3. Nombres estándar
-- ---------------------------------------------------------------------------
alter table order_items rename constraint order_items_pkey to pk_order_item;
alter table order_items rename constraint order_items_order_id_fkey to fk_order_item_order;
alter index idx_order_items_order rename to idx_order_item_order;

-- ROLLBACK (ejecutar en orden descendente):
-- alter index idx_order_item_order rename to idx_order_items_order;
-- alter table order_items rename constraint fk_order_item_order to order_items_order_id_fkey;
-- alter table order_items rename constraint pk_order_item to order_items_pkey;
-- alter table order_items alter column volume type numeric(10,2);
-- alter table order_items alter column product_name set not null;   -- solo si no hay NULL
-- alter table order_items drop constraint if exists ck_order_item_line_number;
-- alter table order_items drop constraint if exists uq_order_item_order_line;
-- alter table order_items drop column if exists notes, drop column if exists wms_situation,
--   drop column if exists wms_status, drop column if exists expiry_date, drop column if exists quantity_cancelled,
--   drop column if exists quantity_loaded, drop column if exists quantity_prepared, drop column if exists lot,
--   drop column if exists presentation, drop column if exists line_number;

-- ---------------------------------------------------------------------------
-- 4. Validación
-- ---------------------------------------------------------------------------
do $$
declare
  faltantes text[];
begin
  select array_agg(objeto) into faltantes
  from (values
      ('line_number obligatorio',  exists (select 1 from information_schema.columns where table_name = 'order_items' and column_name = 'line_number' and is_nullable = 'NO')),
      ('uq_order_item_order_line', exists (select 1 from pg_constraint where conname = 'uq_order_item_order_line')),
      ('pk_order_item',            exists (select 1 from pg_constraint where conname = 'pk_order_item')),
      ('fk_order_item_order',      exists (select 1 from pg_constraint where conname = 'fk_order_item_order')),
      ('volume numeric(12,4)',     exists (select 1 from information_schema.columns where table_name = 'order_items' and column_name = 'volume'
                                           and numeric_precision = 12 and numeric_scale = 4)),
      ('líneas desde 1 por pedido', not exists (select order_id from order_items group by order_id having min(line_number) <> 1))
    ) as v(objeto, ok)
  where not ok;

  if faltantes is not null then
    raise exception 'Validación sql/44: FALTA %', array_to_string(faltantes, ', ');
  end if;
  raise notice 'Validación sql/44: OK';
end $$;

commit;
