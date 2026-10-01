# Decisiones de arquitectura (ADR) — Domain Design, Módulo OMS (rebanada delgada)

> Intent: `260826-modulo-oms`. Re-corrida por el pivote WMH (2026-09-30),
> **acotada a la rebanada delgada de 1ª entrega**. Cada ADR: Contexto, Decisión,
> Consecuencias, Alternativas rechazadas.

## ADR-001: Motor de reglas del OMS propio y nuevo (C2 RESUELTO)

- **Contexto**: El OMS necesita un motor de reglas que priorice pedidos. Existe un
  motor maduro en TypeScript de frontend (`src/lib/tarifas/`, AST versionado) y el
  02-to-be/ADR-003 recomendaba un **motor compartido OMS+TMS** generalizando ese
  AST. C2 estaba abierto.
- **Decisión** (C2-RESUELTO, project.md 2026-09-30): el motor de reglas del OMS se
  construye **NUEVO, desde cero, propio del OMS, en el backend (Python/Lambda)**.
  NO se porta el AST de `src/lib/tarifas/`, NO se comparte motor con el TMS, NO se
  toca Liquidaciones ni ningún módulo del TMS. OMS y TMS son módulos separados que
  se comunican.
- **Consecuencias**: (+) el OMS avanza sin depender de refactorizar el motor de
  tarifas del TMS; (+) cero riesgo de regresión en Liquidaciones (ya en
  producción); (+) el motor se diseña para el vocabulario del OMS (prioridad de
  pedido), no un AST genérico. (−) no se reutiliza la madurez del AST TS existente;
  (−) dos motores de reglas en la organización (OMS y TMS) a mantener por separado
  — aceptado: son módulos separados.
- **Alternativas rechazadas**: motor compartido OMS+TMS portando el AST TS→Python
  (02-to-be/ADR-003) — rechazado por acoplar el OMS a Liquidaciones y arriesgar
  regresión; motor de reglas en el frontend TS — rechazado (US9 escribe a
  Aurora+EFLOW, imposible desde el cliente).

## ADR-002: Handoff de dos escrituras OMS→Planificación (D6)

- **Contexto**: El OMS deja el pedido "alistado" y Planificación arma el viaje.
  Antes (v2) el OMS "cambiaba campos en el WMS y hasta ahí llegaba". D6 refina: el
  OMS persiste además en su propia tabla, que es la superficie de handoff.
- **Decisión**: `HandoffPedidosOMS` hace **dos escrituras, dos propósitos**:
  (1) persiste el pedido priorizado en la **tabla propia del OMS** (esquema OMS de
  `logistica_olo`) — handoff que lee Planificación; (2) voltea la `situación` en el
  **WMS/EFLOW** — dispara el picking. Orden: escritura 1 ANTES de la 2. Fallo
  parcial: si la 2 falla tras la 1, el registro OMS queda "disparo pendiente" y se
  reintenta idempotente sin re-crear el handoff. Idempotencia de corrida por clave
  `pedido+almacén+compañía+sucursal`.
- **Consecuencias**: (+) Planificación tiene una superficie de handoff clara (tabla
  del OMS), desacoplada del WMS; (+) el picking se dispara sin que Planificación
  dependa del WMS. (−) dos stores (Aurora + SQL Server EFLOW) sin transacción
  distribuida → consistencia por orden + reintento idempotente, no 2PC
  (`ponytail:` techo = reintento; upgrade = outbox/reconciliación). (−) estado
  intermedio "disparo pendiente" que la UI deberá representar (diferido).
- **Alternativas rechazadas**: una sola escritura al WMS (v2) — rechazada por D6
  (Planificación necesita leer de una tabla del OMS, no del WMS); transacción
  distribuida 2PC entre Aurora y SQL Server — rechazada por complejidad/fragilidad.

## ADR-003: Parámetros de ruta por scope (duración estimada, no ruta real)

- **Contexto**: La regla T-1 (`ReglaFecha`) necesita días de salida, horas de
  corte y duración de ruta. El Calendario de Rutas del OMS fue eliminado (D5,
  ruteo dinámico). ¿De dónde salen esos datos?
- **Decisión**: son **parámetros de configuración de la regla, resueltos por
  scope** (CUSTOMER→WAREHOUSE→COUNTRY→GLOBAL, C3), NO una constante global ni un
  componente de calendario. Además, como las rutas son DINÁMICAS y Planificación
  las arma DESPUÉS de que el OMS prioriza, el OMS **no conoce la duración real** de
  la ruta al priorizar → la "duración de ruta" del T-1 es un **estimado** (parámetro
  por cliente/zona), no la ruta real. Contrato explícito de `ReglaFecha`.
- **Consecuencias**: (+) coherente con D5 (sin calendario fijo); (+) la
  especificidad por cliente se preserva vía scope; (+) el motor no depende de que
  Planificación haya corrido. (−) el T-1 usa un estimado, no la duración real — el
  ajuste fino con la ruta real (si se quisiera) sería trabajo posterior y
  probablemente de Planificación, no del OMS.
- **Alternativas rechazadas**: componente CalendarioRutas (eliminado por D5);
  constante global de duración (rechazada: debe ser por scope); leer la ruta real
  del TMS al priorizar (imposible: la ruta no existe aún en ese momento).

## ADR-004: Alcance acotado a la rebanada delgada de 1ª entrega

- **Contexto**: Decisión de secuencia de negocio: tener primer código demostrable
  (esqueleto del motor en Lambda) cuanto antes, resolviendo C2/D6/OQ en paralelo.
- **Decisión**: esta corrida de domain-design detalla **solo los 5 componentes de
  la rebanada** (MotorReglasOMS, ReglaFecha, AnalizadorObservaciones,
  ColaCandidatos, HandoffPedidosOMS). El resto (CatalogoReglas, Simulador,
  Auditoría completa, override, Panel, todas las UI) queda **DIFERIDO** (listado,
  no eliminado). `CalendarioRutas` queda **ELIMINADO** (D5). Units Generation y
  Code Generation arrancan por el esqueleto del `MotorReglasOMS`.
- **Consecuencias**: (+) camino corto a código demostrable; (+) el diseño diferido
  no se pierde (queda listado); (−) habrá corridas posteriores de domain-design
  para los componentes diferidos (aceptado — es la secuencia pedida).
- **Alternativas rechazadas**: diseñar los 15 componentes de una vez (modelo del
  backup) — rechazado por la decisión de secuencia (rebanada primero); eliminar los
  diferidos — rechazado (solo se difieren, el alcance del OMS no cambia).

## ADR-005: El cálculo de score como submódulo puro del motor

- **Contexto**: La regla Testing Posture (project.md 2026-08-28) exige que el
  cálculo de prioridad se pueda probar sin montar el resto del motor. En el diseño
  previo (v2) `CalculadorScore` era un componente separado.
- **Decisión**: en el motor nuevo, el cálculo de score (suma ponderada → prioridad
  numérica invertida + desempate estable) es un **submódulo PURO dentro de
  `MotorReglasOMS`**, sin efectos, testeable aislado. No se modela como componente
  separado en esta rebanada (simplicidad), pero mantiene la propiedad de pureza/
  testabilidad que la regla exige.
- **Consecuencias**: (+) cumple Testing Posture; (+) un componente menos que
  coordinar en la rebanada. (−) menos granularidad que el v2; si creciera, podría
  extraerse a componente propio.
- **Alternativas rechazadas**: `CalculadorScore` como componente separado (v2) —
  innecesario para la rebanada; cálculo embebido impuro — rechazado por Testing
  Posture.

## ADR-006: Aterrizaje de los contratos al DDL real del WMS/EFLOW

- **Contexto**: Se obtuvo el DDL real (SQL Server) de EXPEDICIONESCABECERA,
  EXPEDICIONESDETALLE y ALMACENMOVIMIENTOS_CARCAM
  (`docs/wms-eflow/EFLOW_OLO-ddl.sql`, 2026-10-01). Los contratos de la rebanada
  usaban nombres provisionales (`expedición_cabecera`, estado/situación genéricos,
  "fecha nula").
- **Decisión**: aterrizar los contratos a los nombres reales. (1) **Estado =
  `TPEXES`, situación = `TPEXSI`** (varchar(6), FK TIPOSINTEGRACION; DISP/GENE); la
  Cola filtra sobre ellos; la escritura 2 del handoff hace `TPEXSI → 'GENE'` y
  **`TPEXES` permanece `'DISP'`** (solo cambia la situación). (2) El fallback de
  ReglaFecha se dispara por **valor centinela/default**, no por NULL
  (`FECHAEXPEDICIONPLANIFICADA` es datetime NOT NULL). (3) Clave de idempotencia =
  **PK (IDALMACEN, IDCOMPANIA, IDSUCURSAL, IDEXPEDICION)**. (4) `PRIORIDAD` int NOT
  NULL es el campo que escribe el OMS. (5) `OBSERVACIONESEXPEDICION` varchar(500) es
  el texto que lee AnalizadorObservaciones. (6) OQ-8: `PESOPEDIDO_TOTAL`/
  `CUBICAJEPEDIDO_TOTAL` (float NULL) existen en cabecera → el handoff puede
  cargarlos (OQ-8 informada, no cerrada).
- **Consecuencias**: (+) code-generation parte de nombres reales, menos ambigüedad;
  (+) la semántica "situación cambia, estado permanece" queda fijada. (−) depende de
  catálogos aún no entregados (TIPOSINTEGRACION, CLIENTES/ALMACENCOMPANIA) — pendiente
  no bloqueante, a pedir antes del code-generation en vivo.
- **Alternativas rechazadas**: mantener nombres provisionales — rechazado (code-
  generation los necesita reales); disparar el fallback por NULL — rechazado (el
  campo es NOT NULL, nunca sería NULL).

## Sources

- `aidlc/spaces/default/intents/260826-modulo-oms/inception/domain-design/components.md`.
- `docs/wms-eflow/EFLOW_OLO-ddl.sql` (DDL real del WMS/EFLOW, 2026-10-01).
- `aidlc/spaces/default/memory/project.md` (`## Decided`: C2-RESUELTO, D6, D5, C3-SUPERSEDE; Testing Posture).
- `aidlc/spaces/default/intents/260826-modulo-oms/inception/requirements-analysis/requirements.md` (v3).

## Assumptions & Open Questions

- Seguridad/aislamiento (guardrail de fase): la resolución de reglas por scope y el
  aislamiento multi-tenant se apoyan en `user_scopes` del backend (fail-closed);
  el detalle de autorización por acción es de NFR/Functional Design.
- Grafo acíclico verificado: MotorReglasOMS depende de los otros 4; ninguno de los
  4 depende del motor (ColaCandidatos/ReglaFecha/AnalizadorObservaciones/
  HandoffPedidosOMS son hojas desde la perspectiva de la orquestación).
- Consistencia del handoff (D6): sin 2PC; orden + reintento idempotente. El estado
  "disparo pendiente" se materializa en `PedidoOMS.estadoHandoff`.
