-- U2 — esquema-pedidos-oms: tabla PROPIA del OMS (superficie de handoff).
--
-- Intent AI-DLC: 260826-modulo-oms (rebanada delgada de 1a entrega, 2026-10-01).
-- DECIDED D6: el OMS persiste el pedido priorizado en SU PROPIA tabla (esquema OMS
-- de logistica_olo); Planificación LEE de aquí (no del WMS). Es la escritura 1 del
-- HandoffPedidosOMS.
--
-- Aurora PostgreSQL. Esquema `oms` (esquema por MÓDULO, no por compañía; la
-- multi-compañía se resuelve por columnas de scope, DECIDED 2026-09-15).
--
-- PK compuesta = PK de EXPEDICIONESCABECERA (DDL real), clave de idempotencia del
-- handoff: re-correr una priorización hace UPSERT, no duplica.
--
-- NOTA (reparto del canal): este archivo vive en sql/ (terreno de backend/Claude);
-- lo genera Kiro por la excepción "hacé todo" del usuario para este tramo. Avisado
-- en .agents/CANAL.md. Si el dueño de backend prefiere crear la tabla a partir del
-- contrato en vez de este DDL, el contrato es el de abajo.

CREATE SCHEMA IF NOT EXISTS oms;

CREATE TABLE IF NOT EXISTS oms.pedidos (
    -- PK compuesta (idempotencia del handoff).
    id_almacen      integer NOT NULL,
    id_compania     integer NOT NULL,
    id_sucursal     integer NOT NULL,
    id_expedicion   bigint  NOT NULL,

    -- Resultado del motor.
    prioridad       integer NOT NULL,              -- numérica invertida: menor = más urgente
    status          text    NOT NULL,              -- p.ej. 'priorizado'
    situacion       text    NOT NULL,              -- 'generada' (lo que lee Planificación)

    -- Estado de las dos escrituras (D6, sin 2PC): 'disparo_pendiente' | 'completado'.
    estado_handoff  text    NOT NULL DEFAULT 'disparo_pendiente',

    -- Trazabilidad de la corrida que lo priorizó.
    corrida         text    NOT NULL,

    -- Peso/volumen (OQ-8): nullable; null = desconocido, nunca 0.
    peso_total      double precision NULL,
    cubicaje_total  double precision NULL,

    creado_en       timestamptz NOT NULL DEFAULT now(),
    actualizado_en  timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT pk_oms_pedidos PRIMARY KEY (id_almacen, id_compania, id_sucursal, id_expedicion),
    CONSTRAINT ck_oms_pedidos_prioridad CHECK (prioridad >= 1)
);

-- Planificación consulta por situación (los 'generada' pendientes de asignar viaje).
CREATE INDEX IF NOT EXISTS ix_oms_pedidos_situacion ON oms.pedidos (situacion);

-- Reconciliación: barrido de los que quedaron en 'disparo_pendiente' (escritura 2
-- del handoff no confirmada).
CREATE INDEX IF NOT EXISTS ix_oms_pedidos_estado_handoff ON oms.pedidos (estado_handoff);

COMMENT ON TABLE oms.pedidos IS
    'Tabla propia del OMS: pedidos priorizados, superficie de handoff que lee Planificación (intent 260826-modulo-oms, D6).';
