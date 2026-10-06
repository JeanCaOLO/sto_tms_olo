# Plan de Bolts — Módulo OMS (rebanada delgada de 1ª entrega)

> Intent: `260826-modulo-oms`. Etapa: Delivery Planning (Inception, capstone,
> 2026-10-01). Consume: requirements.md v3, stories.md v3, components.md (acotado),
> unit-of-work.md (U1/U2), unit-of-work-dependency.md (DAG `U1 → U2`).
>
> Un **Bolt** es una unidad desplegable de trabajo dentro de Construcción: una
> pasada completa de diseño + construcción + tests sobre una o varias Unidades de
> Trabajo, que termina en algo que corre. Este plan ordena los Bolts de la
> rebanada actual.

## Resumen

La rebanada de 1ª entrega es un **único Bolt** (walking skeleton). Un **walking
skeleton** (Cockburn) es el primer slice de punta a punta que toca cada capa de
la arquitectura y prueba que el todo se sostiene, antes de refinar funcionalidad.
Aquí el esqueleto cubre el flujo completo del motor del OMS contra mocks/stubs
declarados, con las dos unidades de la rebanada construidas juntas.

## Secuencia de Bolts

| Bolt | Unidades | ¿Walking skeleton? | Mob |
|---|---|---|---|
| Bolt 1 | U1 `motor-reglas-oms` (service) + U2 `esquema-pedidos-oms` (spec) | Sí | `aidlc-developer-agent` |

## Bolt 1 — Esqueleto de `motor-reglas-oms` + `esquema-pedidos-oms`

- **Unidades que agrupa**: U1 (`motor-reglas-oms`, service) y U2
  (`esquema-pedidos-oms`, spec). U2 es un `spec` pequeño y prerequisito directo de
  la escritura 1 del handoff (`HandoffPedidosOMS` escribe en la tabla `PedidosOMS`
  cuyo esquema define U2), por eso se construye dentro del mismo Bolt y no como un
  Bolt separado. Respeta el DAG `U1 → U2` (U2 se materializa antes de que U1 use su
  escritura 1).

- **¿Es el walking skeleton?**: Sí. Prueba de punta a punta todas las capas de la
  arquitectura de la rebanada:
  1. **Entrada** — `ColaCandidatos` lee `EXPEDICIONESCABECERA` (TPEXES/TPEXSI=
     `'DISP'`, `FECHACIERRE IS NULL`, `NUMEROVIAJEWMH IS NULL`; anti-join con
     `ALMACENMOVIMIENTOS_CARCAM`). Contra **mock** (la réplica de `EFLOW_OLO` aún
     no existe, OQ-2).
  2. **Reglas** — `ReglaFecha` (T-1 sobre `FECHAEXPEDICIONPLANIFICADA`, duración de
     ruta estimada por scope, fallback por valor centinela) +
     `AnalizadorObservaciones` (cliente-retira sobre `OBSERVACIONESEXPEDICION`,
     contra un **clasificador stub** determinístico — Bedrock a construir).
  3. **Orquestación + score** — `MotorReglasOMS` resuelve reglas por scope
     (CUSTOMER→WAREHOUSE→COUNTRY→GLOBAL), invoca las reglas, calcula el **score
     ponderado como submódulo puro y testeable** (Testing Posture), aplica umbral y
     orden, y el efecto cliente-retira.
  4. **Salida** — `HandoffPedidosOMS` ejecuta las **dos escrituras** (D6): (1) la
     tabla propia del OMS `PedidosOMS` (esquema de U2); (2) `TPEXSI='GENE'` en
     `EXPEDICIONESCABECERA` (`TPEXES` permanece `'DISP'`). Orden: 1 antes de 2, sin
     2PC, idempotencia por PK, reintento. La escritura de `PRIORIDAD` al WMS queda
     tras un **flag/config parametrizable** con `TODO` visible (pendiente de
     confirmar si va a la tabla del OMS, al WMS, o a ambos).
  5. **Persistencia** — migración del esquema `PedidosOMS` (U2) en Aurora
     (esquema OMS de `logistica_olo`).

- **Definition of Done**:
  - Los 5 módulos internos existen como código Python ejecutable dentro de una
    Lambda (estándar Intelix SAM) del backend.
  - El cálculo de score corre como **submódulo puro testeable**, sin dependencia de
    I/O (Testing Posture del proyecto).
  - Tests unitarios verdes para cada módulo; el clasificador de observaciones usa
    el stub determinístico en los unitarios.
  - El esquema de `PedidosOMS` está migrado.
  - El flujo completo corre de punta a punta contra los mocks/stubs declarados
    (ver `external-dependency-map.md`).
  - Las dependencias con mock/stub quedan marcadas con `TODO` visible en el código
    (réplica EFLOW y Bedrock), para no perder de vista que el esqueleto NO corre
    contra el WMS real todavía.

- **Hipótesis de confianza (qué prueba shipping este Bolt)**: que la arquitectura
  elegida — motor propio del OMS (sin AST compartido con el TMS, C2-RESUELTO),
  Lambda única con partición por **scope** (no por compañía, C3-SUPERSEDE), dos
  escrituras idempotentes sin 2PC — es **construible y testeable tal como quedó
  diseñada**, antes de invertir en la integración real con Bedrock y la réplica de
  EFLOW.

- **Demo esperada**: una corrida del motor sobre un conjunto de pedidos mock que
  (a) calcula score y prioridad numérica invertida, (b) detecta cliente-retira vía
  stub, (c) produce las dos escrituras (fila en `PedidosOMS` + `TPEXSI='GENE'` en
  el mock del WMS), (d) muestra idempotencia al re-correr (no duplica por PK).

- **Mob que lo posee**: `aidlc-developer-agent` (team-formation fue SKIP en el
  scope `classic`; sin equipos humanos declarados, aplica el default de la
  framework).

## Iteración de Construcción

Con un solo Bolt que construye una unidad completa (U1) junto con su spec de datos
(U2) antes que cualquier otra cosa, el orden natural es **unit-major**
(diseñar y construir la unidad completa, con el primer código ejecutable al cierre
del bloque), coherente con un plan walking-skeleton-first. Se registrará
`set-construction-iteration unit-major` en el handoff de la etapa.

## Sources

- `aidlc/spaces/default/intents/260826-modulo-oms/inception/requirements-analysis/requirements.md` (v3).
- `aidlc/spaces/default/intents/260826-modulo-oms/inception/user-stories/stories.md` (v3, rebanada US1, US7–US13).
- `aidlc/spaces/default/intents/260826-modulo-oms/inception/domain-design/components.md` (acotado, 5 componentes).
- `aidlc/spaces/default/intents/260826-modulo-oms/inception/units-generation/unit-of-work.md` (U1/U2).
- `aidlc/spaces/default/intents/260826-modulo-oms/inception/units-generation/unit-of-work-dependency.md` (DAG `U1 → U2`).

## Assumptions & Open Questions

- Un solo Bolt para la rebanada actual. Al ampliar el alcance (CatalogoReglas,
  Simulador, Auditoría, Panel, UI) surgirán nuevos Bolts en una corrida posterior.
- Catálogos `TIPOSINTEGRACION` y `CLIENTES`/`ALMACENCOMPANIA` pendientes de pedir
  antes del code-generation contra datos reales (no bloquean el esqueleto).
