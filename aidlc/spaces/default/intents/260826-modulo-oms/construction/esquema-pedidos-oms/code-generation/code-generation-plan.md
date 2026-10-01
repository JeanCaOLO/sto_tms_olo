# Code Generation — U2 `esquema-pedidos-oms` (spec)

> Intent: `260826-modulo-oms`. Fase: Construction. Unidad: U2
> `esquema-pedidos-oms` (kind `spec`). Consume: unit-of-work.md, requirements.md
> (v3). 2026-10-01.
>
> U2 es un **spec**: un contrato de datos (la tabla propia del OMS), no un
> ejecutable desplegable. Su "código" es el DDL de la tabla + el contrato que
> consumen U1 (escritura 1 del handoff) y Planificación (lectura del handoff).

## Qué se construyó

- **`sql/oms_pedidos.sql`** — DDL de la tabla propia del OMS (`oms.pedidos`,
  esquema `oms` de `logistica_olo`, Aurora PostgreSQL). Es la **superficie de
  handoff** que lee Planificación (D6).
- **Contrato en código** — `backend/oms/src/models.py` → dataclass `PedidoOMS`,
  que es la proyección de esa tabla en el dominio del motor (U1 la usa en la
  escritura 1).

## Decisiones de construcción

- **PK compuesta** `(id_almacen, id_compania, id_sucursal, id_expedicion)` =
  misma PK de `EXPEDICIONESCABECERA` (DDL real) → **clave de idempotencia** del
  handoff: la escritura 1 hace `UPSERT` (`ON CONFLICT ... DO UPDATE`), re-correr
  una corrida no duplica.
- **`situacion = 'generada'`** es lo que Planificación espera leer; índice por
  `situacion` para esa consulta.
- **`estado_handoff`** (`'disparo_pendiente'` | `'completado'`) soporta las dos
  escrituras sin 2PC (D6): la fila queda `disparo_pendiente` tras la escritura 1
  y pasa a `completado` tras confirmar la escritura 2 (WMS). Índice para el
  barrido de reconciliación.
- **`peso_total`/`cubicaje_total`** nullable (OQ-8): `null` = desconocido, nunca
  0.
- **Esquema por módulo** (`oms`), no por compañía — la multi-compañía se resuelve
  por columnas/scope (DECIDED 2026-09-15).

## Ubicación y propiedad

- El DDL vive en `sql/` (terreno del dueño de backend en el reparto del canal).
  Generado por Kiro bajo la excepción "hacé todo" del usuario; avisado en
  `.agents/CANAL.md`. Si el dueño de backend prefiere crear la tabla a partir del
  contrato, el contrato es el de `sql/oms_pedidos.sql` + `PedidoOMS`.

## Sensores

- `required-sections`, `linter`, `type-check`, `traceability` (advisory en esta
  rebanada; ver notas de traceability.json).

## Sources

- `aidlc/spaces/default/intents/260826-modulo-oms/inception/units-generation/unit-of-work.md` (U2).
- `aidlc/spaces/default/intents/260826-modulo-oms/inception/domain-design/components.md` (entidad `PedidoOMS`).
- `docs/wms-eflow/EFLOW_OLO-ddl.sql` (PK de `EXPEDICIONESCABECERA`).

## Assumptions & Open Questions

- El esquema se aplica como migración en Aurora cuando el dueño de backend lo
  integre a su flujo de migraciones; el esqueleto no lo despliega.
