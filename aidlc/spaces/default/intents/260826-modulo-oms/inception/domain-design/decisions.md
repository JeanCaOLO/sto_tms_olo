# Decisiones de arquitectura (ADR) — Domain Design, Módulo OMS (rebanada delgada)

> Intent: `260826-modulo-oms`. **Re-corrida v4 por reuniones de negocio
> (2026-10-16): inversión del flujo OMS↔Planificación.** Acotada a la rebanada
> delgada de 1ª entrega. Cada ADR: Contexto, Decisión, Consecuencias, Alternativas
> rechazadas.
>
> **Nomenclatura (vigente)**: WMS = **EFLOW**; módulo que parte EPA por línea =
> **EPRAC**. **ADR nuevos de esta re-corrida: ADR-007..ADR-012** (D7–D13).
> **ADR-002 queda SUPERSEDED** por ADR-007/ADR-008.

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

## ADR-002: Handoff de dos escrituras OMS→Planificación (D6) — **SUPERSEDED por ADR-007/ADR-008**

> **SUPERSEDED (2026-10-16)**: la inversión del flujo (D7) y la escritura real a
> EFLOW (D8) superan este ADR en dos puntos: (1) ya **no hay tabla propia del OMS
> en esquema OMS** — la superficie es **`public.orders`** (esquema único `public`);
> la "escritura 1" es un UPDATE a `orders`. (2) El OMS **ya no se auto-dispara ni
> extrae de EFLOW**: Planificación lo **activa** (ADR-007) y el OMS lee de `orders`.
> Lo que se mantiene: dos escrituras con orden + reintento idempotente, sin 2PC.
> Ver ADR-007 (activación) y ADR-008 (escritura a orders + EFLOW). Texto original
> abajo para trazabilidad.

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

## ADR-003: Parámetros de ruta por scope (duración estimada) — **SUPERSEDED por ADR-007/ADR-010**

> **SUPERSEDED (2026-10-16)**: la premisa de este ADR quedó **falsa** con la
> inversión del flujo (D7). Decía que "el OMS prioriza ANTES que Planificación, la
> duración es un ESTIMADO de config por scope, y el motor NO depende de que
> Planificación haya corrido". Con D7, **Planificación corre PRIMERO** (procesa,
> asigna viaje y activa al OMS), así que: (1) la **duración logística es un INSUMO
> REAL por pedido/viaje que entrega Planificación** (no un estimado de config del
> OMS) — ver **ADR-010**; (2) el motor **sí depende** de que Planificación haya
> corrido (lo activa, ADR-007). Se mantiene: default 1 día para Cofersa; la
> especificidad por cliente/scope sigue aplicando a los pesos/parámetros de reglas
> que no son la duración. Texto original abajo para trazabilidad.

- **Contexto**: La regla T-1 (`ReglaFecha`) necesita días de salida, horas de
  corte y duración de ruta. El Calendario de Rutas del OMS fue eliminado (D5,
  ruteo dinámico). ¿De dónde salen esos datos?
- **Decisión** (SUPERSEDED): eran **parámetros de configuración de la regla,
  resueltos por scope** (CUSTOMER→WAREHOUSE→COUNTRY→GLOBAL, C3); y, como se asumía
  que las rutas se armaban DESPUÉS del OMS, la "duración de ruta" del T-1 era un
  **estimado**, no la ruta real. **Esto queda superado por D7/ADR-010**: la
  duración la entrega Planificación como insumo real.
- **Consecuencias** (del texto original): coherente con D5; especificidad por scope.
  La premisa "el motor no depende de que Planificación haya corrido" es la que D7
  invalida.
- **Alternativas rechazadas**: componente CalendarioRutas (eliminado por D5);
  constante global de duración (rechazada: por scope); leer la ruta real del TMS al
  priorizar (en el modelo D7 la duración llega como insumo de Planificación, no se
  lee del TMS).

## ADR-004: Alcance acotado a la rebanada delgada de 1ª entrega

- **Contexto**: Decisión de secuencia de negocio: tener primer código demostrable
  (esqueleto del motor en Lambda) cuanto antes, resolviendo C2/D6/OQ en paralelo.
- **Decisión** (actualizada 2026-10-16 con la inversión del flujo): esta corrida
  de domain-design detalla los componentes de la rebanada **en alcance**:
  **LambdaActivacion** (entrada async, D7/ADR-007), **MotorReglasOMS**,
  **ColaCandidatos** (lee `public.orders`, ADR-007), **ReglaEPA** (D9/ADR-009),
  **ReglaFecha** (fecha generalizada, D10/ADR-010), **ReglaClienteRetiraZona**
  (D11/ADR-011), **HandoffPedidosOMS** (UPDATE orders + EFLOW, D8/ADR-008) y el
  **esqueleto de BackorderInventario** (loop desacoplado, D13/ADR-012).
  **`AnalizadorObservaciones` pasa a DIFERIDO** (D11/ADR-011: cliente-retira es
  zona, no IA). El resto (CatalogoReglas, Simulador, Auditoría completa, override,
  Panel, todas las UI) queda **DIFERIDO** (listado, no eliminado).
  `CalendarioRutas` queda **ELIMINADO** (D5). Units Generation y Code Generation
  arrancan por el esqueleto del `MotorReglasOMS` y la `LambdaActivacion`.
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
- **Decisión**: aterrizar los contratos a los nombres reales. (1) **La Cola lee de
  `public.orders`** (D7/ADR-007), **ya NO filtra `TPEXES/TPEXSI` por anti-join en
  EFLOW** — esos nombres de EFLOW se mapean a columnas de origen de `orders`
  (`wms_status`, `wms_situation`, llave EFLOW; ver
  `docs/reference/mapeo-pedidos-eflow-orders.md`); la lectura filtra sobre `orders`
  (con viaje asignado, pendientes). La **escritura 2 del handoff** sí va a EFLOW:
  hace `TPEXSI → 'GENE'` y **`TPEXES` permanece `'DISP'`** (solo cambia la
  situación). (2) El fallback de ReglaFecha se dispara por **valor
  centinela/default**, no por NULL (`FECHAEXPEDICIONPLANIFICADA`/`delivery_date` es
  NOT NULL). (3) Clave de idempotencia = **llave EFLOW (IDALMACEN, IDCOMPANIA,
  IDSUCURSAL, IDEXPEDICION)** en `orders` (columnas `eflow_id_*`). (4) `PRIORIDAD`
  (int) es el campo que escribe el OMS en EFLOW (y `priority` en `orders`).
  (5) `OBSERVACIONESEXPEDICION` → `observaciones` en `orders` (hoy la lee la vía de
  cliente-retira **por zona**, no la IA, que quedó diferida — ADR-011). (6) OQ-8:
  `PESOPEDIDO_TOTAL`/`CUBICAJEPEDIDO_TOTAL` (→ `total_weight`/`total_volume` en
  `orders`, float NULL) existen → se pueden cargar (OQ-8 informada, no cerrada).
- **Consecuencias**: (+) code-generation parte de nombres reales, menos ambigüedad;
  (+) la semántica "situación cambia, estado permanece" queda fijada. (−) depende de
  catálogos aún no entregados (TIPOSINTEGRACION, CLIENTES/ALMACENCOMPANIA) — pendiente
  no bloqueante, a pedir antes del code-generation en vivo.
- **Alternativas rechazadas**: mantener nombres provisionales — rechazado (code-
  generation los necesita reales); disparar el fallback por NULL — rechazado (el
  campo es NOT NULL, nunca sería NULL).

## Sources

- `aidlc/spaces/default/intents/260826-modulo-oms/inception/domain-design/components.md`.
- `aidlc/spaces/default/intents/260826-modulo-oms/inception/requirements-analysis/requirements.md` (**v4**, flujo invertido).
- `docs/wms-eflow/EFLOW_OLO-ddl.sql` (DDL real del WMS/EFLOW, 2026-10-01).
- `docs/reference/mapeo-pedidos-eflow-orders.md` (mapeo EFLOW → `public.orders`).
- `aidlc/spaces/default/memory/project.md` (`## Decided`: C2-RESUELTO, D5, C3-SUPERSEDE; Testing Posture; esquema único `public`).

## Assumptions & Open Questions

- Seguridad/aislamiento (guardrail de fase): la resolución de reglas por scope y el
  aislamiento multi-tenant se apoyan en `user_scopes` del backend (fail-closed);
  el detalle de autorización por acción es de NFR/Functional Design.
- Grafo acíclico verificado: `MotorReglasOMS` depende de ColaCandidatos, ReglaEPA,
  ReglaFecha, ReglaClienteRetiraZona y HandoffPedidosOMS; `LambdaActivacion` activa
  al motor (async); `BackorderInventario` reusa HandoffPedidosOMS. Sin ciclos.
- Consistencia del handoff (D7/D8): sin 2PC; orden (UPDATE `orders` → EFLOW) +
  reintento idempotente. El estado del handoff se materializa en
  **`orders.handoff_status`** (`disparo_pendiente` → `completado`).
- **Contrato de la lambda de activación (ADR-007) — RESUELTO (2026-10-16)** con el
  dueño de Planificación: **pull por columna `oms_processed_at` + lambda como
  señal** (no llaves en el payload). Cola del OMS =
  `wms_trip_number IS NOT NULL AND oms_processed_at IS NULL`; barrido periódico como
  red de seguridad; idempotencia natural por la columna; el OMS procesa por
  compañía. Ya no es una OQ.
- **Migración de columnas nuevas** (a cargo del dueño de Planificación, en su PR de
  tablas, no por fuera): `orders.oms_processed_at timestamptz`,
  `orders.lead_time_days` (denormalizada), `plan_trips.lead_time_days`.
- **Duración logística (ADR-010) — modelo confirmado**: `plan_trips.lead_time_days`
  la calcula Planificación al armar el viaje y se **denormaliza en
  `orders.lead_time_days`** al confirmar el plan; el OMS la lee por pedido.
  Cofersa = 1 día fijo; mayoreo VE = dinámica. **Limitación conocida (OQ, no
  cerrada)**: el cálculo dinámico por clúster (geografía/distancia) **aún no está
  construido**; hoy Planificación entrega un **mapa estático zona→días** (ej. Zona 4
  = T-2, resto T-1). El enganche (columna) existe; el cálculo dinámico es futuro.
- **OQ-BO1 (backorder, ADR-012)**: ¿de qué tabla/estado de EFLOW lee el OMS las
  **acciones omitidas** por inventario?
- **OQ-BO2 (backorder, ADR-012)**: ¿cuál es la **fuente de inventario** que
  consulta el OMS?
- **OQ-BO3 (backorder, ADR-012)**: ¿el **disparador** del re-chequeo es un **evento
  de entrada de inventario** o un **barrido periódico**?


---

## ADR-007: Flujo invertido — Planificación → OMS por POLLING de columna (D7)

- **Contexto**: En el modelo previo el OMS extraía de EFLOW los `DISP/DISP` y se
  auto-disparaba (cron/EventBridge), decidiendo él qué entraba. Negocio
  **invirtió el flujo**: Planificación procesa primero, asigna el viaje y recién
  entonces el OMS prioriza.
- **Decisión (CONTRATO CERRADO con Planificación — IA de Planificación + negocio
  Antonio/Eduardo, 2026-10-16)**: el OMS **deja de auto-dispararse**. **Activación
  v1 = POLLING de columna** (no lambda/evento). La **columna es la ÚNICA fuente de
  verdad**:
  - **Planificación** guarda los pedidos en `public.orders`, les asigna viaje
    (`numero_viaje`, formato `YYYYMMDD-NNN`), estampa `planning_run_id` y
    `lead_time_days` por pedido, y deja `oms_processed_at` **vacía (NULL)**. Deja los
    pedidos en situación `DISP`.
  - El **OMS resuelve su cola por POLLING** sobre `public.orders`:
    **`WHERE planning_run_id IS NOT NULL AND oms_processed_at IS NULL`**. Esa columna
    es la única fuente de verdad del lote; el OMS estampa `oms_processed_at = now()`
    al terminar de priorizar cada pedido (lo saca de la cola).
  - **EventBridge / señal por evento = MEJORA FUTURA** (requiere infra); **no es
    requisito de v1 y no bloquea**. v1 es polling puro de la columna.
  - **Orden de procesamiento**: el OMS procesa **por compañía**, ordenando él mismo
    el conjunto NULL resuelto. Planificación **no conoce** el batching del OMS.
  - **Columnas ya existen y pobladas** (planes reales 20–23 oct): `orders.numero_viaje`,
    `orders.lead_time_days`, `orders.planning_run_id`, `orders.oms_processed_at`,
    `plan_trips.numero_viaje`, `plan_trips.lead_time_days`. **No hay columnas que crear
    del lado del OMS.**
- **Consecuencias**: (+) desacople real (sin dependencia de un evento: la columna
  es la verdad); (+) idempotencia natural por `oms_processed_at` (sin coordinar
  run_ids ni payloads); (+) el OMS controla su propio batching por compañía;
  (+) v1 no necesita infra de eventos. (−) latencia del polling como piso (mejora:
  EventBridge a futuro); (−) las columnas las posee/puebla Planificación (el OMS
  solo lee + estampa `oms_processed_at`).
- **Alternativas rechazadas**: invocación **síncrona** — rechazada (acopla
  Planificación al tiempo del OMS); **llaves explícitas en el payload como
  mecanismo de entrega** — rechazada (la verdad es la columna, no el payload);
  **lambda/evento como mecanismo de v1** — **diferida a futuro** (EventBridge
  requiere infra; v1 es polling puro, no bloquea).
- **Estado**: **CERRADO** con Planificación (IA de Planificación + negocio, 2026-10-16).
  Columnas ya existen y pobladas (planes 20–23 oct). Marcador de cola =
  `planning_run_id IS NOT NULL AND oms_processed_at IS NULL`. No queda nada por
  definir para construir U1.

## ADR-008: Escritura a public.orders + EFLOW real, sin tabla propia (D7/D8)

- **Contexto**: D6 preveía una tabla propia del OMS en "esquema OMS". La BD aplicada
  el 2026-10-16 descartó `oms.pedidos`: **la tabla del OMS es `public.orders`**
  (esquema único `public`), ya con llave EFLOW en texto, `priority` entero y las
  columnas del WMS/OMS. Además negocio confirmó que la **prioridad sí se escribe en
  EFLOW**.
- **Decisión (REFINADA 2026-10-16 — eFlow read-only, escritura 2 por costura)**:
  `HandoffPedidosOMS` hace **escritura 1 = UPDATE a `public.orders`** (por la llave
  EFLOW: `priority`, `oms_score`, `wms_situation='GENE'`, `handoff_status`,
  `prioritization_run_id`, `oms_processed_at=now()`). **Escritura 2 (situación=GENE +
  PRIORIDAD)**: **eFlow real es READ-ONLY** — el OMS **nunca escribe directo a
  eFlow**. La escritura de vuelta irá por un **endpoint que proveerá EPRAC**; como
  **aún no existe**, la escritura 2 se **simula escribiendo en
  `sim_expedicionescabecera`** (tabla ya creada en Aurora). Se diseña detrás de una
  **costura/interface** cuyo destino hoy es `sim_expedicionescabecera` y mañana se
  intercambia por el endpoint EPRAC **sin tocar el motor**. **`GENE` lo pone SOLO el
  OMS** (Planificación deja los pedidos en `DISP`; el OMS es el único que sube a
  `GENE`; no hay riesgo de pisar un `GENE` porque Planificación nunca lo escribe y
  `oms_processed_at` saca el pedido de la cola). El OMS **no escribe el número de
  viaje** (`orders.numero_viaje` lo escribe Planificación) ni toca el picking. Orden
  1→2, reintento idempotente, sin 2PC.
- **Consecuencias**: (+) coherente con la BD y el código ya aplicados (rama oms);
  (+) la costura permite cambiar `sim_expedicionescabecera` → endpoint EPRAC sin
  tocar el motor; (+) eFlow read-only elimina el riesgo de escritura directa al WMS.
  (−) la escritura 2 es simulada hasta que exista el endpoint EPRAC (deuda explícita);
  (−) `orders` es compartida: disciplina de columnas (OMS: prioridad/situación/
  `oms_processed_at`; Planificación: `numero_viaje`/`lead_time_days`/`planning_run_id`).
- **Alternativas rechazadas**: tabla propia `oms.pedidos` (D6) — rechazada; **escribir
  directo a eFlow real** — **rechazada** (eFlow es read-only; va por endpoint EPRAC);
  hardcodear el destino de la escritura 2 — rechazada (va detrás de costura
  intercambiable).

## ADR-009: EPA cortocircuita el score — prioridad pre-asignada por EPRAC (D9)

- **Contexto**: EPA no funciona como Cofersa/mayoreo. **EPRAC** parte el pedido de
  la tienda EPA por línea en dos expediciones (mismo número + guion): guion-0
  (falla ⇒ prioridad 0, la más alta) y guion-1 (regular ⇒ prioridad 1). La
  prioridad **ya viene dada**.
- **Decisión**: modelar **`ReglaEPA`** como **rama propia que cortocircuita** el
  motor de fecha/score. Para EPA (`customer_type=TIENDA`) el OMS **no recalcula**:
  toma la prioridad 0/1 que trae y pone ambas expediciones en `wms_situation='GENE'`,
  liberándolas **juntas**. No pasa por ReglaFecha ni por el score ponderado.
- **Consecuencias**: (+) respeta la lógica de EPRAC sin duplicarla; (+) separa
  claramente EPA (pre-asignada) de Cofersa/mayoreo (calculada). (−) el motor tiene
  dos caminos (EPA vs. resto) — aceptado: es la realidad del negocio.
- **Alternativas rechazadas**: tratar EPA como un caso más del motor de fecha/score
  — rechazada (EPA no usa T−duración; la prioridad ya viene dada por EPRAC).

## ADR-010: Regla de fecha generalizada — duración como insumo de Planificación (D10)

- **Contexto**: T-1 (listo = entrega − 1) era la regla. Pero para mayoreo VE la
  "duración logística" es dinámica (días de rodada por clúster/distancia) y la
  calcula Planificación; no hay tabla fija de zonas-días.
- **Decisión**: generalizar a `fecha_listo = fecha_de_entrega − duración_logística`
  (**T-1 = caso Cofersa**, duración 1). La **duración logística es un INSUMO POR
  PEDIDO/VIAJE que entrega Planificación** (ya no un parámetro fijo de config del
  OMS). **Mecanismo confirmado (2026-10-16)**: Planificación la calcula en
  **`plan_trips.lead_time_days`** al armar el viaje y la **denormaliza en
  `orders.lead_time_days`** al confirmar el plan; el OMS la **lee por pedido** desde
  `orders`. Cofersa = 1 día fijo; mayoreo VE = dinámica. Default 1 día si no viene.
  Fallback por valor centinela/default (no por NULL).
- **Limitación conocida (OQ, no cerrada)**: el **cálculo dinámico por clúster**
  (geografía/distancia) de VE **aún no está construido**. Hoy Planificación entrega
  un **mapa estático zona→días** (ej. Zona 4 = T-2, resto T-1); el enganche (la
  columna `lead_time_days`) ya existe, el cálculo dinámico de verdad es futuro.
  US7/US8 asumen "duración = insumo de Planificación (hoy estático por zona,
  dinámico a futuro)", no un cálculo del OMS.
- **Consecuencias**: (+) una sola regla cubre CR y VE; (+) el OMS no modela rutas
  ni calcula duración (coherente con el ruteo dinámico, D5); (+) el enganche por
  columna desacopla al OMS del algoritmo de Planificación (estático hoy, dinámico
  mañana, sin cambios en el OMS). (−) mientras el cálculo dinámico no exista, VE usa
  el mapa estático por zona.
- **Alternativas rechazadas**: tabla de zonas-días fija **en el OMS** — rechazada
  (la duración la conoce y entrega Planificación por `lead_time_days`, no el OMS);
  que el OMS calcule la duración — rechazada (es responsabilidad de Planificación).

## ADR-011: Cliente retira = zona, no observaciones; IA diferida (D11)

- **Contexto**: Se preveía detectar "cliente retira" interpretando el texto libre
  de observaciones con IA (Bedrock). Negocio decidió modelarlo como una **zona**.
- **Decisión**: **`ReglaClienteRetiraZona`** identifica "cliente retira" por
  `delivery_zone` (determinista), le da prioridad máxima y lo agrupa.
  `AnalizadorObservaciones` (IA/Bedrock) queda **DIFERIDO a futuro** (otras salidas:
  dirección, cita), fuera de esta entrega.
- **Consecuencias**: (+) determinista y testeable sin IA; (+) elimina de la 1ª
  entrega el costo/latencia/fragilidad de Bedrock. (−) depende de que la zona esté
  bien catalogada; (−) se posterga el valor del análisis de texto libre.
- **Alternativas rechazadas**: cliente-retira por IA sobre observaciones (modelo
  previo) — rechazada por D11 (zona es más simple y robusta para este caso).

## ADR-012: Backorder/inventario como loop propio desacoplado (D13)

- **Contexto**: Hoy nada re-genera automáticamente las líneas que quedaron en falta
  por inventario. Negocio asignó esa responsabilidad al OMS (aterriza la "regla 5").
- **Decisión**: modelar **`BackorderInventario`** como **loop/componente propio
  DESACOPLADO** de la ruta de priorización (no dentro del handoff de la corrida ni
  de la lambda de activación): revisión continua/por evento que (1) lee las acciones
  liberadas omitidas por inventario, (2) chequea inventario, (3) re-manda a generar
  solo esas acciones cuando entra stock (reusando `HandoffPedidosOMS`). Para la
  rebanada: solo el **esqueleto + open questions**; el diseño fino no se cierra.
- **Consecuencias**: (+) separación limpia (la corrida de priorización no se mezcla
  con el backorder); (+) extensible a futuro. (−) quedan abiertas integraciones
  clave (de dónde lee las acciones omitidas, fuente de inventario, disparador) —
  hechos de negocio/integración para la próxima reunión, no se inventan.
- **Open questions (no cerradas)**: OQ-BO1 tabla/estado de acciones omitidas en
  EFLOW; OQ-BO2 fuente de inventario; OQ-BO3 disparador (evento de entrada de
  inventario vs. barrido periódico).
- **Alternativas rechazadas**: meter el backorder dentro de la corrida de
  priorización — rechazada (acopla dos ritmos distintos: la corrida es por lote
  activado, el backorder es continuo/por evento).