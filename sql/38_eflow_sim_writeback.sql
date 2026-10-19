-- ============================================================================
-- 38_eflow_sim_writeback.sql — tabla que SIMULA la cabecera de eFlow para el
-- write-back del numero de viaje.
--
-- eFlow real es READ-ONLY desde el TMS: no podemos escribir NUMEROVIAJEWMH en la
-- cabecera de produccion. Mientras ePrac entrega el endpoint de escritura formal,
-- Planificacion "escribe" el nro de viaje AQUI (misma clave que eFlow), para
-- simular el paso del flujo "actualizar el nro de viaje del pedido en la cabecera".
--
-- Clave = la de EXPEDICIONESCABECERA (compania, almacen, sucursal, expedicion).
-- Estandar OLTP INTELIX: snake_case, prefijo pk_ en la primary key, bloque
-- ROLLBACK. Nota: tms_olo es el esquema migrado y NO usa prefijo tbl_ en las
-- tablas; se mantiene la consistencia del esquema existente. Aurora. Idempotente.
-- ============================================================================

create table if not exists eflow_sim_cabecera (
  id_compania      text        not null,
  id_almacen       text        not null,
  id_sucursal      text        not null,
  id_expedicion    text        not null,
  numero_viaje_wmh text,                                   -- lo "escribe" Planificacion
  planning_run_id  uuid,                                   -- corrida que lo escribio
  escrito_en       timestamptz not null default now(),
  constraint pk_eflow_sim_cabecera primary key (id_almacen, id_compania, id_sucursal, id_expedicion)
);

comment on table eflow_sim_cabecera is
  'Simulacion de la cabecera de eFlow para el write-back del nro de viaje (NUMEROVIAJEWMH), mientras eFlow real es read-only. Planificacion hace UPSERT al asignar viaje.';

-- ============================================================================
-- ROLLBACK (descomentar y ejecutar para deshacer)
-- ----------------------------------------------------------------------------
-- drop table if exists eflow_sim_cabecera;
-- ============================================================================
