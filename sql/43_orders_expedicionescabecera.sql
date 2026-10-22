-- ============================================================================
-- 43 — Maestros EFLOW, paso 3: orders = EFLOW EXPEDICIONESCABECERA.
--
-- Plan: docs/work/2026-10/2026-10-16-plan-modelo-pedidos-clientes-eflow.md
-- (paso 3). Decisiones en aidlc/spaces/default/memory/project.md (2026-10-16).
--
--   * Relaciones con los maestros (obligatorias): warehouse_id (almacén),
--     branch_id (sucursal), final_customer_id (tienda o cliente de mayoreo).
--   * Llave de EFLOW en texto, con ceros a la izquierda: eflow_id_almacen +
--     eflow_id_compania + eflow_id_sucursal + eflow_id_expedicion, única
--     (reemplaza UNIQUE (organization_id, order_number): IDEXPEDICION sola se
--     repite entre sucursales). Las 4 partes aceptan NULL: los pedidos de
--     prueba/demo no vienen de EFLOW y no tienen expedición real.
--   * Datos del WMS en columnas propias; status sigue siendo el estado del TMS.
--   * Resultado del OMS: oms_score, handoff_status, prioritization_run_id.
--   * priority varchar -> integer (hoy ya guarda '1'..'5').
--   * store_id y delivery_address pasan a aceptar NULL (store_id se elimina en
--     el paso 5).
--
-- NO se agregan (decisiones de otros equipos / del usuario):
--   * wms_trip_number (NUMEROVIAJEWMH): la agregó sql/19 y la dropea sql/46; el
--     número de viaje del pedido es orders.numero_viaje (ADR-0004 de Planificación).
--   * dock (MUELLEEXPEDICION): descartado en el mapeo de campos del OMS.
--   * total_volume no cambia de tipo: lo usan las vistas de tarifas
--     (tarifas_v_viaje_cargas / tarifas_v_viaje_pedidos). Pendiente con su equipo.
--
-- Backfill de los pedidos existentes (todos de prueba, demo o carga manual: no
-- hay pedidos con llave EFLOW real todavía):
--   * almacén: el de la compañía (customers.warehouse_id) o el de la tienda;
--   * sucursal: la 0001 de la compañía (dato de prueba);
--   * cliente destino: el del punto de entrega si lo tiene; si no, la tienda EPA
--     de stores.code; si no, uno de prueba (determinístico por id del pedido)
--     entre los clientes activos de la compañía (tiendas para EPA; mayoreo con
--     coordenadas para Cofersa);
--   * llave EFLOW: solo compañía, sucursal y cliente (coherentes con lo anterior);
--     almacén y expedición quedan NULL.
--
-- AFECTA A OTROS EQUIPOS (notificados; ellos ajustan su código): todo INSERT en
-- orders debe mandar warehouse_id, branch_id y final_customer_id. Scripts
-- conocidos: agregar_pedidos_reales.py, agregar_viajes_para_recalcular.js,
-- scripts/generar-viajes-automatico.mjs, scripts/seed-guias-despacho-demo.mjs.
--
-- Nomenclatura: estándar OLTP INTELIX en la tabla tocada. Excepciones:
--   * trigger audit_row_change (sql/16 lo recrea con ese nombre);
--   * orders_order_number_trgm (sql/39, equipo de tarifas: su ROLLBACK lo usa).
--
-- Uso:  node --env-file=.env scripts/run-migration.mjs sql/43_...sql            (dry-run)
--       node --env-file=.env scripts/run-migration.mjs sql/43_...sql --execute
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Columnas nuevas (todas NULL al crearse)
-- ---------------------------------------------------------------------------
alter table orders
  add column if not exists warehouse_id             uuid,
  add column if not exists branch_id                uuid,
  add column if not exists final_customer_id        uuid,
  add column if not exists destination_warehouse_id uuid,
  add column if not exists eflow_id_almacen         varchar(4),
  add column if not exists eflow_id_compania        varchar(4),
  add column if not exists eflow_id_sucursal        varchar(4),
  add column if not exists eflow_id_expedicion      varchar(50),
  add column if not exists eflow_id_cliente         varchar(30),
  add column if not exists order_type               varchar(6),
  add column if not exists wms_status               varchar(6),
  add column if not exists wms_situation            varchar(6),
  add column if not exists drop_code                varchar(3),
  add column if not exists emergency                boolean,
  add column if not exists erp_document             varchar(50),
  add column if not exists wms_notes                text,
  add column if not exists generated_at             timestamptz,
  add column if not exists closed_at                timestamptz,
  add column if not exists planned_dispatch_at      timestamptz,
  add column if not exists wms_created_at           timestamptz,
  add column if not exists wms_modified_at          timestamptz,
  add column if not exists oms_score                numeric(10,2),
  add column if not exists handoff_status           text,
  add column if not exists prioritization_run_id    text;

comment on table orders is 'Pedidos. Equivale a EFLOW EXPEDICIONESCABECERA (PK IDALMACEN+IDCOMPANIA+IDSUCURSAL+IDEXPEDICION). El OMS escribe aquí prioridad, score y situación; Planificación lee de aquí.';
comment on column orders.warehouse_id             is 'Almacén del pedido (EFLOW IDALMACEN -> warehouses.external_code).';
comment on column orders.branch_id                is 'Sucursal de la compañía (EFLOW IDSUCURSAL -> branches.external_code).';
comment on column orders.final_customer_id        is 'Cliente destino: tienda o mayoreo (EFLOW IDCLIENTE -> final_customers.external_code).';
comment on column orders.destination_warehouse_id is 'Almacén destino (EFLOW IDALMACENDESTINO), para traslados entre almacenes.';
comment on column orders.eflow_id_almacen         is 'EFLOW IDALMACEN. Parte de la llave única de EFLOW.';
comment on column orders.eflow_id_compania        is 'EFLOW IDCOMPANIA. Parte de la llave única de EFLOW.';
comment on column orders.eflow_id_sucursal        is 'EFLOW IDSUCURSAL. Parte de la llave única de EFLOW.';
comment on column orders.eflow_id_expedicion      is 'EFLOW IDEXPEDICION. Parte de la llave única de EFLOW (se repite entre sucursales).';
comment on column orders.eflow_id_cliente         is 'EFLOW IDCLIENTE, tal cual viene (se conserva aunque no se resuelva final_customer_id).';
comment on column orders.order_type               is 'EFLOW TPEXPE (tipo de expedición, ej. EXPERP).';
comment on column orders.wms_status               is 'EFLOW TPEXES (estado en el WMS, ej. DISP). status es el estado del TMS.';
comment on column orders.wms_situation            is 'EFLOW TPEXSI (situación en el WMS). El OMS la deja en GENE (generada) para que el WMS haga el picking.';
comment on column orders.drop_code                is 'EFLOW BAJADA.';
comment on column orders.emergency                is 'EFLOW EMERGENCIA (varchar(1) en EFLOW).';
comment on column orders.erp_document             is 'EFLOW DOCUMENTOERP.';
comment on column orders.wms_notes                is 'EFLOW OBSERVACIONESEXPEDICION (texto del cliente/vendedor; lo analiza la regla de observaciones). notes es para notas del TMS.';
comment on column orders.generated_at             is 'EFLOW FECHAGENERACION (cuándo el pedido quedó generado).';
comment on column orders.closed_at                is 'EFLOW FECHACIERRE. La cola del OMS solo toma pedidos sin cierre.';
comment on column orders.planned_dispatch_at      is 'EFLOW FECHAPLANIFICADADESPACHO.';
comment on column orders.wms_created_at           is 'EFLOW FECHACREACION.';
comment on column orders.wms_modified_at          is 'EFLOW FECHAMODIFICACION.';
comment on column orders.oms_score                is 'Score calculado por el motor de reglas del OMS.';
comment on column orders.handoff_status           is 'Estado de la escritura de vuelta al WMS: disparo_pendiente | completado.';
comment on column orders.prioritization_run_id    is 'Corrida de priorización del OMS que dejó el pedido así.';
comment on column orders.priority                 is 'Prioridad numérica invertida (EFLOW PRIORIDAD): menor número = más urgente.';
comment on column orders.delivery_date            is 'EFLOW FECHAEXPEDICIONPLANIFICADA: fecha de ENTREGA que manda el cliente. El OMS la lee y no la modifica.';

alter table orders add constraint fk_order_warehouse             foreign key (warehouse_id)             references warehouses (id);
alter table orders add constraint fk_order_branch                foreign key (branch_id)                references branches (id);
alter table orders add constraint fk_order_final_customer        foreign key (final_customer_id)        references final_customers (id);
alter table orders add constraint fk_order_destination_warehouse foreign key (destination_warehouse_id) references warehouses (id);
alter table orders add constraint ck_order_handoff_status check (handoff_status in ('disparo_pendiente', 'completado'));

-- ---------------------------------------------------------------------------
-- 2. Backfill de los pedidos existentes
-- ---------------------------------------------------------------------------
update orders o
set warehouse_id = coalesce(
      (select c.warehouse_id from customers c where c.id = o.customer_id),
      (select s.warehouse_id from stores s where s.id = o.store_id))
where o.warehouse_id is null;

update orders o
set branch_id = b.id
from branches b
where b.customer_id = o.customer_id and b.external_code = '0001' and o.branch_id is null;

-- a) el cliente del punto de entrega (si es de la misma compañía)
update orders o
set final_customer_id = dp.final_customer_id
from delivery_points dp
join final_customers fc on fc.id = dp.final_customer_id
where dp.id = o.delivery_point_id and fc.customer_id = o.customer_id and o.final_customer_id is null;

-- b) la tienda EPA guardada en stores ('T002' -> final_customers '002', ver sql/41)
update orders o
set final_customer_id = fc.id
from stores s
join final_customers fc on fc.external_code = substr(s.code, 2)
where s.id = o.store_id and s.code ~ '^T[0-9]{3}$'
  and fc.customer_id = o.customer_id and o.final_customer_id is null;

-- c) el resto: cliente de prueba determinístico por id del pedido
with candidatos as (
  select fc.customer_id, fc.id,
         row_number() over (partition by fc.customer_id order by fc.external_code) - 1 as rn,
         count(*) over (partition by fc.customer_id) as n
  from final_customers fc
  join customers c on c.id = fc.customer_id
  join delivery_points dp on dp.final_customer_id = fc.id and dp.is_default
  join addresses a on a.id = dp.address_id
  where fc.status = 'active'
    and ((c.code = 'EPA' and fc.customer_type = 'TIENDA')
      or (c.code <> 'EPA' and fc.customer_type = 'MAYOREO' and a.latitude is not null))
)
update orders o
set final_customer_id = cand.id
from candidatos cand
where cand.customer_id = o.customer_id and o.final_customer_id is null
  and cand.rn = mod(abs(hashtext(o.id::text)::bigint), cand.n);

-- llave EFLOW coherente con las relaciones (almacén y expedición quedan NULL)
update orders o
set eflow_id_compania = c.external_code,
    eflow_id_sucursal = b.external_code,
    eflow_id_cliente  = fc.external_code,
    eflow_id_almacen  = w.external_code
from customers c, branches b, final_customers fc, warehouses w
where c.id = o.customer_id and b.id = o.branch_id and fc.id = o.final_customer_id and w.id = o.warehouse_id
  and o.eflow_id_compania is null;

-- ---------------------------------------------------------------------------
-- 3. Llave única de EFLOW, obligatoriedad y tipos
-- ---------------------------------------------------------------------------
alter table orders drop constraint orders_organization_id_order_number_key;
alter table orders add constraint uq_order_eflow_key
  unique (eflow_id_almacen, eflow_id_compania, eflow_id_sucursal, eflow_id_expedicion);

alter table orders alter column warehouse_id      set not null;
alter table orders alter column branch_id         set not null;
alter table orders alter column final_customer_id set not null;
alter table orders alter column store_id          drop not null;
alter table orders alter column delivery_address  drop not null;

alter table orders alter column priority drop default;
alter table orders alter column priority type integer using nullif(trim(priority), '')::integer;
alter table orders add constraint ck_order_priority check (priority >= 1);

-- ---------------------------------------------------------------------------
-- 4. Nombres estándar (restricciones e índices existentes) + índices nuevos
-- ---------------------------------------------------------------------------
alter table orders rename constraint orders_pkey                   to pk_order;
alter table orders rename constraint orders_customer_id_fkey       to fk_order_customer;
alter table orders rename constraint orders_delivery_point_id_fkey to fk_order_delivery_point;
alter table orders rename constraint orders_organization_id_fkey   to fk_order_organization;
alter table orders rename constraint orders_route_type_id_fkey     to fk_order_zone;
alter table orders rename constraint orders_store_id_fkey          to fk_order_store;
alter index idx_orders_customer rename to idx_order_customer;
alter index idx_orders_date     rename to idx_order_order_date;
alter index idx_orders_org      rename to idx_order_organization;
alter index idx_orders_status   rename to idx_order_status;
alter index idx_orders_store    rename to idx_order_store;

create index if not exists idx_order_warehouse      on orders (warehouse_id);
create index if not exists idx_order_branch         on orders (branch_id);
create index if not exists idx_order_final_customer on orders (final_customer_id);
create index if not exists idx_order_wms_situation  on orders (wms_situation);
create index if not exists idx_order_handoff_status on orders (handoff_status) where handoff_status is not null;

-- ROLLBACK (ejecutar en orden descendente; los datos de prueba del backfill se
-- pierden al borrar las columnas):
-- drop index if exists idx_order_handoff_status, idx_order_wms_situation, idx_order_final_customer,
--   idx_order_branch, idx_order_warehouse;
-- alter index idx_order_store rename to idx_orders_store;
-- alter index idx_order_status rename to idx_orders_status;
-- alter index idx_order_organization rename to idx_orders_org;
-- alter index idx_order_order_date rename to idx_orders_date;
-- alter index idx_order_customer rename to idx_orders_customer;
-- alter table orders rename constraint fk_order_store to orders_store_id_fkey;
-- alter table orders rename constraint fk_order_zone to orders_route_type_id_fkey;
-- alter table orders rename constraint fk_order_organization to orders_organization_id_fkey;
-- alter table orders rename constraint fk_order_delivery_point to orders_delivery_point_id_fkey;
-- alter table orders rename constraint fk_order_customer to orders_customer_id_fkey;
-- alter table orders rename constraint pk_order to orders_pkey;
-- alter table orders drop constraint if exists ck_order_priority;
-- alter table orders alter column priority type varchar(50) using priority::text;
-- alter table orders alter column priority set default 'normal';
-- alter table orders alter column delivery_address set not null;   -- solo si no hay NULL
-- alter table orders alter column store_id set not null;           -- solo si no hay NULL
-- alter table orders drop constraint if exists uq_order_eflow_key;
-- alter table orders add constraint orders_organization_id_order_number_key unique (organization_id, order_number);
-- alter table orders drop constraint if exists ck_order_handoff_status;
-- alter table orders drop column if exists prioritization_run_id, drop column if exists handoff_status,
--   drop column if exists oms_score, drop column if exists wms_modified_at, drop column if exists wms_created_at,
--   drop column if exists planned_dispatch_at, drop column if exists closed_at, drop column if exists generated_at,
--   drop column if exists wms_notes, drop column if exists erp_document, drop column if exists emergency,
--   drop column if exists drop_code, drop column if exists wms_situation, drop column if exists wms_status,
--   drop column if exists order_type, drop column if exists eflow_id_cliente, drop column if exists eflow_id_expedicion,
--   drop column if exists eflow_id_sucursal, drop column if exists eflow_id_compania, drop column if exists eflow_id_almacen,
--   drop column if exists destination_warehouse_id, drop column if exists final_customer_id,
--   drop column if exists branch_id, drop column if exists warehouse_id;

-- ---------------------------------------------------------------------------
-- 5. Validación: aborta la transacción si falta algo.
-- ---------------------------------------------------------------------------
do $$
declare
  faltantes text[];
begin
  select array_agg(objeto) into faltantes
  from (values
      ('warehouse_id obligatorio',      exists (select 1 from information_schema.columns where table_name = 'orders' and column_name = 'warehouse_id' and is_nullable = 'NO')),
      ('branch_id obligatorio',         exists (select 1 from information_schema.columns where table_name = 'orders' and column_name = 'branch_id' and is_nullable = 'NO')),
      ('final_customer_id obligatorio', exists (select 1 from information_schema.columns where table_name = 'orders' and column_name = 'final_customer_id' and is_nullable = 'NO')),
      ('priority entero',               exists (select 1 from information_schema.columns where table_name = 'orders' and column_name = 'priority' and data_type = 'integer')),
      ('uq_order_eflow_key',            exists (select 1 from pg_constraint where conname = 'uq_order_eflow_key')),
      ('sin llave vieja order_number',  not exists (select 1 from pg_constraint where conname = 'orders_organization_id_order_number_key')),
      ('pk_order',                      exists (select 1 from pg_constraint where conname = 'pk_order')),
      ('fk_order_final_customer',       exists (select 1 from pg_constraint where conname = 'fk_order_final_customer')),
      ('cliente destino de la misma compañía', not exists (select 1 from orders o join final_customers fc on fc.id = o.final_customer_id
                                                          where fc.customer_id <> o.customer_id)),
      ('sucursal de la misma compañía', not exists (select 1 from orders o join branches b on b.id = o.branch_id
                                                   where b.customer_id <> o.customer_id)),
      ('vistas de tarifas siguen',      to_regclass('public.tarifas_v_viaje_pedidos') is not null
                                        and to_regclass('public.tarifas_v_viaje_cargas') is not null)
    ) as v(objeto, ok)
  where not ok;

  if faltantes is not null then
    raise exception 'Validación sql/43: FALTA %', array_to_string(faltantes, ', ');
  end if;
  raise notice 'Validación sql/43: OK';
end $$;

commit;
