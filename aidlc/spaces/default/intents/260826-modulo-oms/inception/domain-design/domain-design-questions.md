# Domain Design — Preguntas de fronteras de componentes (Módulo OMS)

> Intent: `260826-modulo-oms`. Etapa: Domain Design (Inception). Lead: arquitecto;
> apoyo: plataforma AWS, diseño. Consume: `requirements.md` v2 (14 FR),
> `stories.md` (34 historias), codekb brownfield.
>
> **Nota de contexto**: casi todas las fronteras ya están firmes en
> `project.md` (`## Decided`) — no las re-abrimos. Estas preguntas cubren solo
> **decisiones reales de descomposición** que aún admiten más de una forma
> viable. Cada una trae un **default** (opción A) alineado con lo firme; basta
> confirmar o corregir. Domain Design NO decide topología de despliegue
> (Units Generation), ni stack, ni NFR.
>
> Responde en la etiqueta `[Answer]:` de cada pregunta (letra, o texto libre en
> la opción `X`).

---

## Q1 — Granularidad del motor de priorización

El corazón del OMS es el motor que lee la cola, calcula prioridad (T-1 + score),
aplica el umbral de inyección y escribe `situación=GENERADA`+prioridad. ¿Cómo lo
descomponemos en bloques lógicos?

- **A. (default)** Separar por responsabilidad en varios componentes de dominio:
  `ColaCandidatos` (lee/resuelve la cola FR1), `MotorPriorizacion` (orquesta la
  corrida: score ponderado + umbral + orden, FR3), `ReglaFecha` (T-1, FR2),
  `AnalizadorObservaciones` (IA/Bedrock, FR6.2/FR7), `EscritorEflow` (escritura
  atómica DISP→GENERADA + prioridad, FR8). El motor orquesta las reglas; cada
  regla es un bloque con su propia lógica y peso. Coincide con project.md
  ("una Lambda por compañía" a nivel de empaque lo resuelve Units Generation).
- **B.** Un único componente `MotorOMS` monolítico que contiene fecha,
  observaciones, score, umbral y escritura (menos bloques, menos testable por
  regla).
- **C.** Como A pero además separar `CalculadorScore` de `MotorPriorizacion`
  (el score ponderado como bloque propio, reutilizable por el Simulador).
- **X. Other (please specify)**

[Answer]: C — CalculadorScore es componente propio. Motivo firme: regla Testing Posture (project.md, 2026-08-28) que exige extraer el cálculo de prioridad a módulos puros testeables; y el score ponderado entra DESDE la 1ª entrega (DECIDED 2026-09-14), responsabilidad distinta del orquestador. Resultado: ColaCandidatos, MotorPriorizacion, ReglaFecha, AnalizadorObservaciones (IA), CalculadorScore, EscritorEflow.

---

## Q2 — Propiedad de la lógica de reglas vs. su configuración

El catálogo de reglas (FR5) es semi-configurable: la **lógica** vive en código
(Lambda), pero **estado/peso/parámetros por compañía** se editan y persisten.
¿Un solo componente o dos?

- **A. (default)** Dos componentes: `CatalogoReglas` (dueño de la configuración
  persistida por compañía: on/off, peso, parámetros, entidad `ConfiguracionRegla`)
  y las **reglas ejecutables** (ReglaFecha, AnalizadorObservaciones… de Q1) que
  LEEN esa configuración al correr. Separa "qué se puede tocar desde la UI" de
  "la lógica que no se toca". Alineado con el invariante "lógica en código".
- **B.** Un solo `MotorReglas` que es a la vez catálogo configurable y ejecutor.
- **X. Other (please specify)**

[Answer]: A

---

## Q3 — El Simulador como componente y su relación con el motor

El Simulador (FR9) es un **configurador**: define/persiste/programa/aplica
simulaciones (entidad `Simulacion` con estados simulada/aplicada, una aplicada
por compañía). ¿Reusa el motor o lo duplica?

- **A. (default)** `Simulador` es un componente propio, dueño de las entidades
  `Simulacion` y `ConfiguracionSimulacion` (por compañía), que **invoca al
  `MotorPriorizacion`** (Q1) con un subconjunto de reglas/pedidos y persiste el
  resultado. No duplica el cálculo: el motor es la única fuente del score. Al
  "aplicar", escribe vía el mismo `EscritorEflow`.
- **B.** El Simulador incluye su propia copia del cálculo (independiente del
  motor productivo) — más aislado pero con riesgo de divergencia.
- **X. Other (please specify)**

[Answer]: A

---

## Q4 — Frontera entre núcleo compartido (TMS) y propio del OMS

`project.md` fija: el TMS es dueño del núcleo (pedido, ruta, chofer, camión,
viaje, calendario de rutas); el OMS lo **consume**. Sus tablas propias son
`route_dispatch_schedule`, `order_priority_*` y el motor. ¿Cómo representamos lo
que el OMS NO posee?

- **A. (default)** Modelar el núcleo del TMS y EFLOW como **dependencias
  externas** (`external_dependencies`), no como componentes del OMS: `EFLOW_OLO`
  (réplica de lectura de `expedición_cabecera`/`detalle`/`carcam`), `MaestroCompañías`
  (Capa X), `TMS/Planificación` (abre el viaje), `TMS/Rutas` (fuente de verdad del
  calendario). El OMS solo posee las entidades de prioridad, la configuración de
  reglas, las simulaciones, la auditoría y el schedule de rutas que consume/cachea.
- **B.** Modelar también un componente-adaptador del OMS por cada dependencia
  externa (p. ej. `AdaptadorEflow`, `AdaptadorMaestroCompañías`) como bloques
  propios que encapsulan el acceso.
- **X. Other (please specify)**

[Answer]: A — con cuidado: el OMS LEE y ESCRIBE en EFLOW/WMS. Además del EscritorEflow (DISP→GENERADA + prioridad), el lado LECTURA de la cola se modela como su propio adaptador/fuente (expedición_cabecera: fecha_de_cierre IS NULL + DISP, sin NUMEROVIAJEWMH), dentro de ColaCandidatos. EFLOW/Maestro/TMS quedan como dependencias externas (sin componentes-adaptador extra, opción B descartada).

---

## Q5 — UI: ¿un componente de front por pantalla o uno por área?

El OMS tiene 6 pantallas (Cola, Panel/Auditoría, Motor de Reglas, Simulador,
Calendario de Rutas) ya materializadas en el prototipo React `src/pages/oms/`.
A nivel de **dominio** (bloques lógicos, no archivos), ¿cómo las agrupamos?

- **A. (default)** Un componente de UI por **área funcional** que mapea 1:1 con
  el backend que consume: `UICola`, `UIPanelAuditoria`, `UICatalogoReglas`,
  `UISimulador`, `UICalendarioRutas`. Cada uno traza a su componente de dominio.
  Coincide con el prototipo y con el design system real del repo.
- **B.** Un solo componente `UI-OMS` (toda la SPA del OMS como un bloque).
- **X. Other (please specify)**

[Answer]: A

---

## Q6 — Auditoría y override: ¿componente propio o parte de otro?

El override manual (FR4) y la Auditoría de solo lectura (FR11.3, FR14.3) están
acoplados: todo override se registra; la auditoría también registra las
priorizaciones automáticas.

- **A. (default)** `Auditoria` es un componente propio (dueño de la entidad
  `RegistroAuditoria`, solo-lectura, distingue auto/manual + usuario/motivo), y
  el **override** es una operación del `MotorPriorizacion`/`CatalogoReglas` que
  ESCRIBE en `Auditoria`. Un solo dueño del registro auditable.
- **B.** Override y Auditoría como un único componente `OverrideYAuditoria`.
- **X. Other (please specify)**

[Answer]: A

---

## Assumptions & Open Questions

- Las OQ-1..OQ-7 de `requirements.md` (BD oficial, réplica EFLOW inexistente,
  fecha de Cofersa, tabla de prioridades, score-vs-filtro, cortes, viaje cliente
  retira) se tratan como **dependencias externas / parámetros**, no como
  decisiones de frontera de componentes. No bloquean el diseño de dominio.
- El codekb `architecture.md` §6 muestra el modelo viejo ("lago de datos"); se
  ignora como target — superado por `requirements.md` v2 (escritura a nivel
  WMS/EFLOW). El prototipo `src/pages/oms/` es la referencia de UI vigente.
- La topología de despliegue (Lambda por compañía, agrupación en unidades
  desplegables) la decide **Units Generation**, no esta etapa.

## Consolidated Summary Confirmation

Resumen de Domain Design presentado y confirmado en conversación: 10 componentes
de dominio (ColaCandidatos, MotorPriorizacion, CalculadorScore, ReglaFecha,
AnalizadorObservaciones, EscritorEflow, CatalogoReglas, Simulador, Auditoria,
CalendarioRutas) + 5 de UI por área; 7 entidades con dueño único; 8 ADRs; grafo
acíclico. Decisiones Q1=C, Q2–Q6=A. Precisiones del gate incorporadas (ADR-008):
dueño explícito del EFECTO "cliente retira" (MotorPriorizacion/CalculadorScore,
no AnalizadorObservaciones) y nota de partición multi-compañía (Units/Deployment,
sin colapsar la lógica por compañía). Sensores: required-sections PASS,
upstream-coverage PASS, traceability = falso positivo advisory conocido.

[Answer]: Looks correct
