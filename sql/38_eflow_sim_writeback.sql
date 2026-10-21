-- ============================================================================
-- 38_eflow_sim_writeback.sql — tabla que SIMULA la cabecera de eFlow
-- (EXPEDICIONESCABECERA) para el write-back del número de viaje.
--
-- eFlow real es READ-ONLY desde el TMS: no podemos escribir NUMEROVIAJEWMH en la
-- cabecera de producción. Esta tabla es una COPIA ESTRUCTURAL COMPLETA de la
-- cabecera (las 56 columnas de origen, CON LOS MISMOS NOMBRES EXACTOS que eFlow),
-- que Planificación sincroniza con la cola y donde "escribe" el NUMEROVIAJEWMH,
-- simulando el paso "actualizar el nº de viaje en la cabecera".
--
-- Nombres de columna EXACTOS a eFlow (mayúsculas) → en Postgres se preservan con
-- comillas dobles. Tabla en Aurora: sim_expedicionescabecera. Clave = la de
-- EXPEDICIONESCABECERA. planning_run_id/escrito_en son EXTRA (trazabilidad).
-- Estándar INTELIX: bloque ROLLBACK. Idempotente.
-- ============================================================================

drop table if exists eflow_sim_cabecera;      -- nombre anterior (mínimo), reemplazado
drop table if exists sim_expedicionescabecera;

create table sim_expedicionescabecera (
  "IDALMACEN"                  text not null,
  "IDCOMPANIA"                 text not null,
  "IDSUCURSAL"                 text not null,
  "IDEXPEDICION"               text not null,
  "TPEXPE"                     text,
  "IDCLIENTE"                  text,
  "IDCLIENTEPROPIETARIO"       text,
  "MUELLEEXPEDICION"           text,
  "IDUNIDADTRANSPORTE"         text,
  "CLASIFICACION1"             text,
  "CLASIFICACION2"             text,
  "CLASIFICACION3"             text,
  "CLASIFICACION4"             text,
  "FECHAEXPEDICION"            timestamptz,
  "FECHAEXPEDICIONPLANIFICADA" timestamptz,
  "FECHAGENERACION"            timestamptz,
  "FECHACIERRE"                timestamptz,
  "FECHAPLANIFICADADESPACHO"   timestamptz,
  "MANIFIESTOFISCAL"           text,
  "PRIORIDAD"                  integer,
  "OBSERVACIONESEXPEDICION"    text,
  "OBSERVACIONESINTEGRACION"   text,
  "TPEXES"                     text,
  "TPEXSI"                     text,
  "IDEXPEDICIONFUCION"         text,
  "TPDOCERP"                   text,
  "DOCDEST"                    text,
  "TIPOCARGA"                  text,
  "REF1"                       text,
  "REF2"                       text,
  "REF3"                       text,
  "EMERGENCIA"                 text,
  "KITS"                       text,
  "FECHACREACION"              timestamptz,
  "RUTA"                       text,
  "IDALMACENDESTINO"           text,
  "IDUSUARIOCREADOR"           text,
  "MEDIOTRANSPORTE"            text,
  "METODOENVIO"                text,
  "NOMBREPRIORIDAD"            text,
  "MAX_LINEAS_USUARIO"         integer,
  "COSTO_TOTAL"                double precision,
  "PESOPEDIDO_TOTAL"           double precision,
  "CUBICAJEPEDIDO_TOTAL"       double precision,
  "DIRECCIONPEDIDO"            text,
  "FACTURA"                    text,
  "DUA"                        text,
  "NUMEROVIAJEWMH"             bigint,                 -- lo "escribe" Planificación
  "KITSPROCESADO"              boolean,
  "TPDECO"                     text,
  "KITSVERIFICADOS"            boolean,
  "BAJADA"                     text,
  "ORDEN_PRODUCCION"           text,
  "CODIGOUSUARIOMODIFICACION"  text,
  "FECHAMODIFICACION"          timestamptz,
  "DOCUMENTOERP"               text,
  planning_run_id              uuid,                   -- EXTRA: corrida que escribió el viaje
  escrito_en                   timestamptz not null default now(),
  constraint pk_sim_expedicionescabecera primary key ("IDALMACEN", "IDCOMPANIA", "IDSUCURSAL", "IDEXPEDICION")
);

comment on table sim_expedicionescabecera is
  'Copia estructural de EXPEDICIONESCABECERA de eFlow (56 columnas, mismos nombres) para simular el write-back del NUMEROVIAJEWMH mientras eFlow real es read-only. Planificacion la sincroniza y escribe NUMEROVIAJEWMH.';

-- ============================================================================
-- ROLLBACK (descomentar y ejecutar para deshacer)
-- ----------------------------------------------------------------------------
-- drop table if exists sim_expedicionescabecera;
-- ============================================================================
