# Delivery Planning — Preguntas de secuenciación (Módulo OMS, rebanada delgada)

> Intent: `260826-modulo-oms`. Etapa: Delivery Planning (Inception, capstone).
> Lead: delivery; apoyo: arquitecto. Consume: requirements.md v3, stories.md v3,
> components.md (acotado, 5 componentes), unit-of-work.md (U1/U2),
> unit-of-work-dependency.md (DAG U1 → U2). Contract Design fue SALTADA (decisión
> del usuario): el contrato de escritura del handoff se resuelve dentro de
> code-generation.
>
> Esta etapa decide el **orden económico** de construcción (qué Bolt va primero y
> por qué), no la topología (eso ya lo fijó Units Generation). Un **Bolt** es una
> unidad desplegable de trabajo dentro de Construcción: una pasada completa de
> diseño + construcción + tests sobre una o varias Unidades de Trabajo, que
> termina en algo que corre.

---

## Contexto que ya resuelve la mayoría de las preguntas estratégicas

La rebanada tiene solo **2 unidades** con un DAG trivial de una arista
(`U1 → U2`), y el usuario ya fijó la secuencia de negocio: **el esqueleto de U1
(`motor-reglas-oms`) es el primer entregable**. Eso ya responde "qué construir
primero" y "qué tan grande es un Bolt" con una respuesta obvia. Las preguntas
abajo confirman esa lectura en vez de abrir el espacio de opciones completo.

## Q1 — Qué construir primero

- **A. (default)** **Slice de punta a punta delgado (walking skeleton)**: Bolt 1 =
  el esqueleto completo y ejecutable de U1 (los 5 módulos internos del motor,
  incluyendo las dos escrituras del handoff hacia U2 y hacia el WMS) con tests.
  Prueba que la arquitectura completa (lectura EFLOW/WMS → reglas → score → dos
  escrituras) funciona de punta a punta antes de refinar cualquier regla.
- **B.** Empezar por lo más riesgoso (la clasificación por IA de
  `AnalizadorObservaciones` con Bedrock) de forma aislada, antes del resto.
- **X. Other (please specify)**

[Answer]: A

---

## Q2 — Modelo de puntaje formal (WSJF-style)

Con solo 2 unidades y una secuencia ya fijada por el usuario, un modelo WSJF
formal (valor de negocio + urgencia ÷ tamaño, Reinertsen/SAFe) no aporta — no hay
nada que puntuar y re-ordenar.

- **A. (default)** No usar un modelo de puntaje formal. La secuencia es
  walking-skeleton-first por decisión explícita del usuario, documentada en
  `risk-and-sequencing-rationale.md` como argumento de riesgo/skeleton, no como
  resultado de un score.
- **B.** Sí, aplicar WSJF con pesos explícitos.
- **X. Other (please specify)**

[Answer]: A

---

## Q3 — Tamaño del Bolt

- **A. (default)** **Un Bolt = una Unidad de Trabajo** (bundling mínimo): Bolt 1 =
  U1 (`motor-reglas-oms`), con U2 (`esquema-pedidos-oms`) construido como parte de
  Bolt 1 porque es un `spec` pequeño (S) y es prerequisito directo de la escritura
  1 del handoff — no amerita un Bolt separado. Bolt 1 entrega el esqueleto completo
  de ambas unidades juntas.
- **B.** Dos Bolts separados: Bolt 1 = U2 (esquema), Bolt 2 = U1 (motor), en ese
  orden.
- **X. Other (please specify)**

[Answer]: A

---

## Q4 — Paralelismo entre Bolts

Con un solo Bolt planeado para esta rebanada, no aplica paralelismo entre Bolts.

- **A. (default)** No aplica: un solo Bolt para toda la rebanada (ver Q3-A). Si en
  una iteración futura se amplía el alcance (CatalogoReglas, Simulador, Auditoría,
  Panel, UI), esos nuevos Bolts podrán evaluarse por paralelismo en su propia
  corrida de Delivery Planning.
- **X. Other (please specify)**

[Answer]: A

---

## Q5 — Qué puede detenernos desde afuera del equipo

- **A. (default)** Dos dependencias externas gated, ninguna bloqueante para el
  esqueleto (ambas se resuelven con mocks/stubs en Bolt 1, documentadas como
  deuda explícita):
  1. **Réplica de `EFLOW_OLO`** (OQ-2): aún no existe (solicitar vía Alfredo). Bolt
     1 usa un mock de lectura; cuando la réplica esté lista, se cambia el
     adaptador de `ColaCandidatos`, sin tocar el resto del motor.
  2. **Integración con Amazon Bedrock** para `AnalizadorObservaciones`: a
     construir (hoy no integrado). Bolt 1 usa un clasificador stub (determinístico,
     testeable) en lugar de la llamada real a Bedrock.
  También quedan pendientes, no bloqueantes para el esqueleto: catálogos
  `TIPOSINTEGRACION` y `CLIENTES`/`ALMACENCOMPANIA` (pedir antes de code-generation
  en vivo contra datos reales).
- **X. Other (please specify)**

[Answer]: A

---

## Q6 — Qué preocupa más de esta construcción

- **A. (default)** El punto de mayor riesgo es el **contrato de escritura del
  handoff** (`HandoffPedidosOMS`): dos escrituras (tabla propia del OMS + WMS) sin
  2PC, con idempotencia por PK y reintento, y con `PRIORIDAD`-al-WMS como
  flag/config parametrizable (pendiente de confirmar si se escribe solo en la
  tabla del OMS, solo en el WMS, o en ambas). Por eso Bolt 1 lo resuelve explícito
  dentro de code-generation (Contract Design fue saltada) con un `TODO` visible en
  el código para la bandera `PRIORIDAD`-al-WMS, en vez de dejarlo implícito.
- **X. Other (please specify)**

[Answer]: A

---

## Preguntas por Bolt

### Bolt 1 — Esqueleto de `motor-reglas-oms` + `esquema-pedidos-oms`

- **Unidades que agrupa**: U1 (`motor-reglas-oms`, service) + U2
  (`esquema-pedidos-oms`, spec).
- **¿Es el walking skeleton?**: Sí — prueba de punta a punta: lectura
  EFLOW/WMS (mock) → `ReglaFecha` + `AnalizadorObservaciones` (stub) →
  `MotorReglasOMS` (score ponderado, submódulo puro) → `HandoffPedidosOMS`
  (dos escrituras, idempotentes, con flag `PRIORIDAD`-al-WMS parametrizable y
  `TODO` visible) → persistencia en el esquema de U2.
- **Definition of Done**: los 5 módulos existen como código ejecutable dentro de
  una Lambda Python; el cálculo de score corre como submódulo puro testeable
  (Testing Posture); tests unitarios pasan para cada módulo; el esquema de
  `PedidosOMS` está migrado; el flujo completo corre de punta a punta contra los
  mocks/stubs declarados en Q5.
- **¿Qué nos dice este Bolt que no sabemos hoy?**: si la arquitectura elegida
  (motor propio del OMS, sin AST compartido, Lambda única con scope
  CUSTOMER→WAREHOUSE→COUNTRY→GLOBAL, dos escrituras idempotentes) es construible
  y testeable tal como quedó diseñada, antes de invertir en la integración real
  con Bedrock y la réplica de EFLOW.
- **Mob que lo posee**: `aidlc-developer-agent` (team-formation fue SKIP en este
  scope `classic`; sin equipos humanos declarados, aplica el default).

[Answer]: Confirmado

---

## Assumptions & Open Questions

- Un solo Bolt cubre toda la rebanada actual (2 unidades). Ampliaciones futuras de
  alcance (componentes diferidos) generarán nuevos Bolts en una corrida posterior
  de Delivery Planning.
- `Construction Autonomy Mode` y el modo de iteración (`stage-major` vs
  `unit-major`) se resuelven en el paso de artefactos, no aquí.

## Consolidated Summary Confirmation

Delivery Planning de la rebanada delgada (2026-10-01): un único Bolt
(walking skeleton) que agrupa U1 (`motor-reglas-oms`, service) + U2
(`esquema-pedidos-oms`, spec). Secuencia walking-skeleton-first por decisión
explícita del usuario (sin WSJF). Dependencias externas gated, no bloqueantes,
resueltas con mock/stub y documentadas como deuda explícita con `TODO` visible:
réplica de `EFLOW_OLO` → mock de lectura; Amazon Bedrock → clasificador stub. El
contrato de escritura del `HandoffPedidosOMS` (dos escrituras sin 2PC,
idempotencia por PK, flag `PRIORIDAD`-al-WMS parametrizable) se resuelve dentro de
code-generation (Contract Design saltada). Mob: `aidlc-developer-agent` (scope
classic, team-formation SKIP). Siguiente: code-generation del esqueleto.

[Answer]: Looks correct
