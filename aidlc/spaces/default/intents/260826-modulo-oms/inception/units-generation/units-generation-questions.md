# Units Generation — Preguntas de descomposición (Módulo OMS)

> Intent: `260826-modulo-oms`. Etapa: Units Generation (Inception). Lead:
> arquitecto; apoyo: delivery. Consume: components.md (15 componentes), decisions.md
> (8 ADRs), requirements.md v2, stories.md (34 historias).
>
> **Nota de contexto**: el destino de despliegue ya está firme en `project.md`
> (`## Decided`): stack Intelix AWS serverless (Python+Lambdas, React,
> PostgreSQL, SAM); backend monorepo `tms-back` (stack SAM por módulo +
> `common-services`); frontend `tms-front` (React→Amplify); **una Lambda por
> compañía**; BD `logistica_olo` esquemas OMS/TMS. Las preguntas se limitan a la
> **estrategia de frontera y granularidad de units** con defaults. Esta etapa
> describe TOPOLOGÍA (DAG), NO orden de implementación ni critical path (eso es
> de Delivery Planning). Responde en cada `[Answer]:`.

---

## Q1 — Estrategia de frontera de units

¿Cómo agrupamos los 15 componentes lógicos en unidades desplegables?

- **A. (default)** **Por afinidad de despliegue en el stack Intelix**: (1) un
  servicio backend del **motor de priorización** (agrupa MotorPriorizacion,
  CalculadorScore, ReglaFecha, AnalizadorObservaciones, EscritorEflow,
  ColaCandidatos — todo lo que corre en la corrida automática); (2) un servicio
  backend de **configuración/catálogo** (CatalogoReglas, CalendarioRutas,
  Auditoria — lo que la UI administra y consulta); (3) el **Simulador** como
  servicio propio (entidad persistida + programación); (4) la **UI OMS** (las 5
  áreas React) como una unit `ui`; (5) un **spec de esquema** de la BD OMS
  (`logistica_olo` esquema OMS) como unit `spec`. La partición por compañía
  (una Lambda por compañía) es una dimensión de despliegue DENTRO del servicio
  del motor, no una unit por compañía (ver Q3).
- **B.** **Por componente** (grano fino): una unit por cada componente de dominio
  (más units, más overhead de contratos).
- **C.** **Por macro-módulo** (grano grueso): un único servicio backend OMS + una
  UI + un spec (menos units, menos aislamiento).
- **X. Other (please specify)**

[Answer]:

---

## Q2 — Granularidad (grano grueso vs. fino)

- **A. (default)** **Grano medio**: ~5 units (motor, config/catálogo, simulador,
  UI, spec de esquema), como en Q1-A. Equilibra aislamiento y overhead; cada unit
  es desplegable y testeable por separado.
- **B.** Grano fino (una unit por componente).
- **C.** Grano grueso (un backend + UI + spec).
- **X. Other (please specify)**

[Answer]:

---

## Q3 — Cómo materializar "una Lambda por compañía"

`project.md` fija: reglas específicas por compañía → una Lambda por compañía; la
regla identifica su compañía; no se parametriza en código. ¿Cómo se refleja en
las units sin colapsar la lógica específica (ADR-008)?

- **A. (default)** El **servicio del motor es una unit genérica** (código común:
  orquestación, score, escritura, lectura) + la **lógica específica por compañía
  vive en Lambdas por compañía** que el motor invoca/despacha. La partición por
  compañía es una **dimensión de empaque/despliegue de esa unit** (varias Lambdas
  desde el mismo servicio SAM), no units separadas por compañía. Así una compañía
  nueva = añadir su Lambda, sin nueva unit. La config editable por compañía vive
  en CatalogoReglas (unit de config).
- **B.** Una **unit desplegable por compañía** (Cofersa, EPA…) — más aislamiento
  pero multiplica units y contratos, y una compañía nueva = nueva unit.
- **X. Other (please specify)**

[Answer]:

---

## Q4 — Modelo de despliegue e integración entre units

- **A. (default)** **Serverless por evento + API**, alineado al estándar Intelix:
  el motor corre por schedule (EventBridge, NFR1) y por invocación; la UI habla
  con los servicios backend vía API Gateway compartido (`common-services`); la
  escritura a EFLOW y la lectura de la réplica son dependencias externas; el spec
  de esquema OMS lo consumen los servicios en su lugar. Cada servicio se despliega
  independiente (SAM por módulo dentro del monorepo `tms-back`); la UI en
  `tms-front` (Amplify). Solo Intelix despliega.
- **B.** Despliegue monolítico (todo el backend OMS en un solo empaque).
- **X. Other (please specify)**

[Answer]:

---

## Q5 — Kind de cada unit (artefactos de diseño que arrastra a Construcción)

Confirma el `kind` propuesto por unit (service/spec/ui/packaging/library):

- **A. (default)**: motor = `service`; config/catálogo = `service`; simulador =
  `service`; UI OMS = `ui`; esquema BD OMS = `spec`. (El spec no debe doc de
  escalabilidad; la UI no doc de lógica de negocio; los servicios llevan la
  matriz completa.)
- **X. Other (please specify)**

[Answer]:

---

## Assumptions & Open Questions

- La partición por compañía (Q3) es dimensión de despliegue, coherente con
  ADR-008 (Domain Design): el modelo lógico es genérico + config por compañía; la
  especificidad por compañía se materializa en Lambdas por compañía, no se colapsa
  en una regla genérica.
- Las OQ-1..OQ-7 (réplica EFLOW inexistente, BD no oficial, etc.) son
  dependencias externas / parámetros; no cambian la topología de units.
- El orden de construcción y el critical path NO se deciden aquí (son de Delivery
  Planning 2.9); esta etapa solo entrega el DAG de dependencias.

## Consolidated Summary Confirmation

Re-corrida ACOTADA a la rebanada delgada (2026-10-01). Units Generation produjo
una descomposición mínima de 2 unidades: U1 `motor-reglas-oms` (kind service — los
5 componentes de la rebanada como módulos internos de una Lambda Python propia del
OMS) y U2 `esquema-pedidos-oms` (kind spec — la tabla propia del OMS, superficie de
handoff). DAG: U1 → U2 (acíclico, edge-block YAML válido). Historias de la rebanada
(US1, US7, US8, US9, US10, US11b, US12, US13) mapeadas a U1 (US9 también a U2);
diferidas y retiradas no se asignan en esta corrida. Units no aportó decisiones de
diseño nuevas (solo topología). Sensores: required-sections PASS (edge_block=ok),
upstream-coverage PASS; traceability = falso positivo advisory conocido. Secuencia:
code-generation arranca por el esqueleto de U1 (MotorReglasOMS en Lambda).

[Answer]: Looks correct
