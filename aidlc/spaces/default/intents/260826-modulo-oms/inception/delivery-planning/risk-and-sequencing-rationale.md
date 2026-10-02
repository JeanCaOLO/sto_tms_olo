# Racional de riesgo y secuenciación — Módulo OMS (rebanada delgada)

> Intent: `260826-modulo-oms`. Etapa: Delivery Planning (2026-10-01). Explica el
> **porqué** del orden de los Bolts. Consume: unit-of-work-dependency.md (DAG),
> bolt-plan.md.

## Heurística aplicada: walking-skeleton-first (Cockburn)

No se aplicó un modelo de puntaje formal. **WSJF** (Weighted Shortest Job First,
Reinertsen/SAFe: `(valor + urgencia + reducción de riesgo) ÷ tamaño`) sirve para
re-ordenar un backlog con varias piezas que compiten por ir primero. Aquí no hay
nada que re-ordenar: la rebanada tiene **una sola unidad desplegable** (U1) más su
spec de datos (U2), y el usuario ya fijó la secuencia de negocio — el esqueleto de
U1 va primero. La heurística de ordenamiento es, por tanto, **walking skeleton
primero** (Cockburn): un slice de punta a punta que prueba que la arquitectura se
sostiene, antes de refinar cualquier regla.

## Respeto del DAG

El DAG de Units Generation es `U1 → U2` (una arista): U1 depende de U2 porque la
escritura 1 del handoff persiste en la tabla cuyo esquema define U2. El Bolt único
construye ambas en el orden correcto (U2 se materializa antes de que U1 ejerza su
escritura 1), así que **no hay desviación del orden topológico** que justificar.

## Riesgos y cómo los ataca el orden

1. **Contrato de escritura del handoff (riesgo principal)**: `HandoffPedidosOMS`
   hace dos escrituras (tabla propia del OMS + WMS) **sin 2PC**. El riesgo es
   consistencia parcial (una escritura ocurre, la otra no) y duplicados en
   reintento. Mitigación en Bolt 1: orden fijo (tabla del OMS primero, WMS
   después), **idempotencia por PK** (IDALMACEN, IDCOMPANIA, IDSUCURSAL,
   IDEXPEDICION), reintento, y un campo `estadoHandoff` ("disparo pendiente") para
   el caso de fallo parcial. La escritura de `PRIORIDAD` al WMS queda tras un
   **flag/config parametrizable** con `TODO` visible (está por confirmar si va solo
   a la tabla del OMS, solo al WMS, o a ambos). Al ser el walking skeleton quien lo
   resuelve, el punto más incierto se construye y prueba primero.
   `ponytail:` el "sin 2PC + reintento idempotente" es una simplificación
   deliberada con techo conocido — bajo fallo entre escritura 1 y 2, un barrido de
   `estadoHandoff='disparo pendiente'` reconcilia; no hay garantía transaccional
   distribuida. Upgrade path: outbox/transactional si el volumen lo exige.

2. **Dependencia de la réplica de `EFLOW_OLO` (OQ-2, no existe aún)**: en vez de
   bloquear, Bolt 1 lee contra un **mock**; el adaptador `ColaCandidatos` aísla la
   lectura, así que cambiar al origen real luego no toca el motor. Deuda explícita
   con `TODO` visible.

3. **Integración con Amazon Bedrock (a construir)**: `AnalizadorObservaciones` usa
   un **clasificador stub** determinístico en Bolt 1; la clasificación real por IA
   se incorpora después sin re-arquitectura. Deuda explícita con `TODO` visible.

4. **Arquitectura del motor propio (C2-RESUELTO)**: construir el motor desde cero
   (sin AST compartido con el TMS) es la decisión de diseño de mayor impacto. El
   walking skeleton la valida como construible antes de invertir en lo demás.

## Por qué un solo Bolt y no dos

Separar U2 (esquema) en su propio Bolt previo añadiría un gate y una pasada de
Construcción para un `spec` de tamaño S que de todos modos es prerequisito
inmediato de la escritura 1 de U1. Agruparlas en un Bolt entrega el esqueleto
completo y ejecutable de una vez, que es exactamente lo que prueba la hipótesis de
confianza. Menos ceremonia, mismo resultado verificable.

## Sources

- `aidlc/spaces/default/intents/260826-modulo-oms/inception/units-generation/unit-of-work-dependency.md` (DAG `U1 → U2`).
- `aidlc/spaces/default/intents/260826-modulo-oms/inception/delivery-planning/bolt-plan.md`.
- `aidlc/spaces/default/intents/260826-modulo-oms/inception/domain-design/decisions.md` (ADR-001..006, C2/C3).

## Assumptions & Open Questions

- La confirmación del destino de la escritura de `PRIORIDAD` (tabla del OMS / WMS /
  ambos) se resuelve en code-generation vía el flag parametrizable; no bloquea el
  esqueleto.
