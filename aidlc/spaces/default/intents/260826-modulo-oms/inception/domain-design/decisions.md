# Decisiones de arquitectura (ADR) — Domain Design, Módulo OMS

> Intent: `260826-modulo-oms`. Registro durable de las decisiones significativas
> de descomposición del OMS. Complementa la tabla Racional de `components.md`.
> Cada ADR: Contexto, Decisión, Consecuencias, Alternativas rechazadas.

## ADR-001: Descomposición del motor en reglas ejecutables + orquestador + adaptadores

- **Contexto**: El corazón del OMS lee la cola, calcula prioridad (T-1 + score),
  aplica el umbral de inyección y escribe `situación=GENERADA`+prioridad. Puede
  modelarse como un monolito o descomponerse por responsabilidad. Los invariantes
  firmes (no fechas, solo WMS/EFLOW, prioridad numérica invertida por score) y la
  necesidad de probar cada regla obligan a pensar la frontera.
- **Decisión**: Descomponer en `ColaCandidatos` (lectura), `MotorPriorizacion`
  (orquestación + override + umbral), `ReglaFecha`, `AnalizadorObservaciones`
  (reglas ejecutables), `EscritorEflow` (escritura atómica). El motor orquesta;
  cada regla es un bloque con su propia lógica y peso.
- **Consecuencias**: (+) cada regla y el orquestador se prueban aislados; (+) los
  invariantes de lectura/escritura quedan encapsulados en un solo adaptador cada
  lado; (+) añadir una regla futura (Regla 4/5) no toca el orquestador. (−) más
  bloques que coordinar; el contrato motor↔regla debe ser estable.
- **Alternativas rechazadas**: `MotorOMS` monolítico (Q1-B) — menos testable por
  regla y mezcla los invariantes de escritura con la lógica de negocio.

## ADR-002: CalculadorScore como componente puro propio

- **Contexto**: El score ponderado (suma de pesos → prioridad numérica invertida)
  entra desde la primera entrega (DECIDED 2026-09-14) y una regla firme de
  Testing Posture (project.md, 2026-08-28) exige extraer el cálculo de prioridad
  a módulos puros testeables sin montar React ni el resto del motor.
- **Decisión**: `CalculadorScore` es un componente/módulo PURO propio (sin
  efectos), separado del `MotorPriorizacion`. Dado un pedido y las reglas
  aplicables con sus pesos, produce score, prioridad numérica invertida y el
  desempate estable.
- **Consecuencias**: (+) el cálculo se prueba con asserts sobre entradas/salidas,
  sin orquestación ni I/O; (+) reutilizable por el Simulador vía el motor; (+)
  cumple la regla de testing firme. (−) un salto de indirección más entre motor y
  cálculo.
- **Alternativas rechazadas**: score embebido en `MotorPriorizacion` (Q1-A) —
  choca con la regla de Testing Posture y con la responsabilidad distinta del
  orquestador.

## ADR-003: Separar la configuración de reglas de su lógica ejecutable

- **Contexto**: El Motor de Reglas es semi-configurable: estado/peso/parámetros
  por compañía se editan y persisten, pero la lógica (y los prompts de IA) vive
  en código y no se toca desde la UI (FR5.4/C6). Un solo componente mezclaría lo
  editable con lo inmutable.
- **Decisión**: `CatalogoReglas` es dueño de la CONFIGURACIÓN persistida por
  compañía (entidad `ConfiguracionRegla`); las reglas ejecutables (`ReglaFecha`,
  `AnalizadorObservaciones`) LEEN esa configuración al correr.
- **Consecuencias**: (+) frontera nítida entre "lo que la UI puede tocar" y "la
  lógica que no"; (+) impide por diseño el alta de reglas desde la UI; (+) la
  config por compañía es un dato con dueño único. (−) el motor debe resolver la
  config activa antes de invocar cada regla.
- **Alternativas rechazadas**: `MotorReglas` único catálogo+ejecutor (Q2-B) —
  difumina la frontera lógica/configuración y arriesga exponer lógica en la UI.

## ADR-004: El Simulador reusa el MotorPriorizacion (no duplica el cálculo)

- **Contexto**: El Simulador (FR9) define/persiste/programa/aplica simulaciones
  (entidad `Simulacion`, una aplicada por compañía). Puede reusar el motor
  productivo o llevar su propia copia del cálculo.
- **Decisión**: `Simulador` es un componente propio (dueño de `Simulacion` y
  `ConfiguracionSimulacion`) que INVOCA al `MotorPriorizacion` con un subconjunto
  de reglas/pedidos y persiste el resultado; al aplicar escribe vía
  `EscritorEflow`.
- **Consecuencias**: (+) una sola fuente de verdad del cálculo (motor); (+) no hay
  riesgo de divergencia simulación↔producción; (+) reusa el mismo camino de
  escritura al aplicar. (−) el motor debe soportar corridas acotadas (subconjunto
  de reglas/pedidos) sin efectos hasta que se aplique.
- **Alternativas rechazadas**: Simulador con cálculo propio (Q3-B) — aislado pero
  con riesgo real de divergir del motor productivo.

## ADR-005: Núcleo del TMS y EFLOW como dependencias externas; lectura/escritura como adaptadores del OMS

- **Contexto**: El TMS es dueño del núcleo (pedido, ruta, chofer, camión, viaje,
  calendario); el OMS lo consume y sus tablas propias son las de prioridad,
  configuración, simulaciones, auditoría y schedule. El OMS LEE y ESCRIBE en
  EFLOW/WMS. Hay que decidir qué es componente del OMS y qué es dependencia.
- **Decisión**: Modelar `EFLOW_OLO` (réplica), `MaestroCompañías` (Capa X),
  `TMS/Rutas` y Amazon Bedrock como **dependencias externas**. El acceso a EFLOW
  se encapsula en dos componentes del OMS: `ColaCandidatos` (lado LECTURA:
  `expedición_cabecera` con `fecha_de_cierre IS NULL` + `DISP` sin `NUMEROVIAJEWMH`,
  contra la réplica) y `EscritorEflow` (lado ESCRITURA: DISP→GENERADA + prioridad,
  atómica, solo WMS/EFLOW). No se crean adaptadores propios adicionales por cada
  dependencia.
- **Consecuencias**: (+) el esquema de EFLOW queda aislado en dos puntos; (+) los
  invariantes de lectura y de escritura tienen un dueño cada uno; (+) el resto del
  dominio no conoce EFLOW. (−) esos dos componentes cargan el acoplamiento al
  esquema externo (aceptable: es su razón de ser).
- **Alternativas rechazadas**: un componente-adaptador del OMS por cada
  dependencia externa (Q4-B) — bloques extra sin lógica de negocio propia.

## ADR-006: UI por área funcional, 1:1 con el backend

- **Contexto**: El OMS tiene 6 pantallas ya materializadas en el prototipo React
  `src/pages/oms/`. A nivel de dominio hay que decidir la granularidad de los
  bloques de UI.
- **Decisión**: Un componente de UI por área (`UICola`, `UIPanelAuditoria`,
  `UICatalogoReglas`, `UISimulador`, `UICalendarioRutas`), cada uno 1:1 con el
  componente de dominio que consume.
- **Consecuencias**: (+) trazabilidad directa UI→dominio; (+) coincide con el
  prototipo y el design system real del repo; (+) cada pantalla evoluciona
  aislada. (−) cinco bloques de UI en vez de uno (coordinación de navegación en la
  SPA, ya resuelta por el prototipo).
- **Alternativas rechazadas**: `UI-OMS` monolítico (Q5-B) — pierde la trazabilidad
  1:1 y agranda el bloque.

## ADR-007: Auditoria como dueño único del registro auditable; override escribe en ella

- **Contexto**: El override manual (FR4) y la Auditoría de solo lectura
  (FR11.3/FR14.3) están acoplados: todo override se registra y la auditoría
  también registra las priorizaciones automáticas.
- **Decisión**: `Auditoria` es un componente propio, dueño de `RegistroAuditoria`
  (solo lectura, distingue auto/manual + usuario/motivo). El override es una
  operación del `MotorPriorizacion` que ESCRIBE en `Auditoria`.
- **Consecuencias**: (+) un solo dueño del registro auditable e inmutable; (+) el
  criterio negativo de solo-lectura (NFR6) se concentra en un componente; (+) el
  Panel lee KPIs de la misma fuente. (−) el motor depende de Auditoria para cerrar
  cada corrida.
- **Alternativas rechazadas**: `OverrideYAuditoria` fusionado (Q6-B) — mezcla una
  operación de escritura de prioridad con el registro de solo lectura.

## ADR-008: Frontera detección/efecto de "cliente retira" y partición multi-compañía

- **Contexto**: Dos precisiones de frontera confirmadas en el gate, para que se
  arrastren a Functional Design / Units sin ambigüedad. (a) "cliente retira" es
  un subconjunto de observaciones que da prioridad máxima + viaje/cliente dummy
  (DECIDED); (b) la multi-compañía es "una Lambda por compañía, la regla
  identifica la compañía, no se parametriza en código" (DECIDED).
- **Decisión**: (a) `AnalizadorObservaciones` solo DETECTA/clasifica; el EFECTO
  tiene dueño explícito: la prioridad máxima la aporta `CalculadorScore` (mayor
  peso) vía `MotorPriorizacion`, y la marca de agrupación en viaje/cliente
  "dummy" la fija `MotorPriorizacion` sobre `RegistroPrioridad` (atributos
  `clienteRetira`, `grupoViajeDummy`); el viaje real lo abre el TMS. (b) El
  modelo lógico de reglas es GENÉRICO con configuración por compañía en
  `CatalogoReglas`; la partición por compañía (Lambda/unidad por compañía con su
  lógica específica) es tema de **Units Generation / Deployment**, no de esta
  capa lógica — la especificidad por compañía no se colapsa en una regla genérica.
- **Consecuencias**: (+) Functional Design sabe qué componente aplica el efecto
  cliente-retira y sobre qué entidad; (+) Units Generation sabe que debe
  materializar la partición por compañía preservando la lógica específica.
  (−) El acople detección↔efecto exige un contrato claro AnalizadorObservaciones→
  MotorPriorizacion (la marca viaja en el resultado de la clasificación).
- **Alternativas rechazadas**: que `AnalizadorObservaciones` aplicara el efecto
  (mezclaría clasificación con priorización/agrupación); colapsar la lógica
  por compañía en una sola regla genérica parametrizada en código (contradice la
  DECIDED de Lambda por compañía).

## Sources

- `aidlc/spaces/default/intents/260826-modulo-oms/inception/domain-design/components.md`.
- `aidlc/spaces/default/intents/260826-modulo-oms/inception/domain-design/domain-design-questions.md`
  (Q1=C, Q2–Q6=A).
- `aidlc/spaces/default/memory/project.md` (`## Decided`, `## Corrections`,
  Testing Posture).
- `aidlc/spaces/default/intents/260826-modulo-oms/inception/requirements-analysis/requirements.md`.

## Assumptions & Open Questions

- Implicaciones de seguridad (guardrail de fase): el aislamiento multi-compañía/
  país (NFR5) se realiza por las columnas `compañía`/`país` en toda entidad del
  OMS y por la Lambda por compañía; los niveles de acceso (FR14) se resuelven en
  la capa de seguridad transversal del TMS. El detalle de autorización por acción
  es de NFR/Functional Design, no de esta etapa.
- No hay ciclos en el grafo de dependencias (verificado): el motor depende de las
  reglas, el score, los adaptadores y la auditoría; el Simulador depende del motor;
  ninguna regla depende del motor.
