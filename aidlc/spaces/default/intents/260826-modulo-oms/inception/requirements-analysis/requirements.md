# Requerimientos — Módulo OMS (Order Management System)

> Intent: `260826-modulo-oms`. Etapa: Requirements Analysis (Inception,
> **re-corrida v4 por reuniones de negocio — inversión del flujo OMS↔Planificación**,
> 2026-10-16). Proyecto brownfield `sto_tms_olo`. Idioma: español.
>
> **Nomenclatura (vigente)**: el WMS es **EFLOW**; el módulo que parte los pedidos
> de EPA por línea es **EPRAC**. (No "IPRAC" ni "IFLOW".)
>
> **Correcciones de esta re-corrida v4 (sobre v3), de reuniones de negocio
> (process owner Antonio):**
>
> 1. **Inversión del flujo (D7)**: el orden se invierte. **Planificación** extrae
>    los pedidos de EFLOW (los `DISP/DISP`), los procesa, les **asigna el viaje** y
>    escribe el `wms_trip_number` de vuelta a EFLOW y a `orders`; **luego invoca al
>    OMS mediante una lambda de activación nueva** (el OMS deja de dispararse por
>    cron/EventBridge sobre EFLOW). El OMS **lee de `public.orders`** los pedidos
>    que Planificación ya procesó (ya con viaje), aplica reglas y **escribe de
>    vuelta a EFLOW** (estado sigue `DISP`, situación `= GENE`, prioridad). El
>    armado del viaje NO es del OMS.
> 2. **Escritura real a EFLOW (D8)**: la escritura de vuelta al WMS se implementa
>    contra EFLOW real (situación `GENE` + prioridad); la **prioridad SÍ se escribe
>    en EFLOW** (flag confirmado en TRUE). El OMS no escribe el número de viaje
>    (lo escribe Planificación) ni toca el picking.
> 3. **EPA sin cálculo (D9)**: para EPA la prioridad viene **pre-asignada** por
>    **EPRAC** (guion-0 = falla = prioridad 0; guion-1 = regular = prioridad 1); el
>    OMS no recalcula, solo pone ambas en `GENE` con su prioridad, liberándolas
>    juntas. EPA no usa la regla de fecha.
> 4. **Regla de fecha generalizada (D10)**: T-1 es un caso particular de
>    `fecha_listo = fecha_de_entrega − duración_logística`. La **duración es un
>    insumo por pedido/viaje que entrega Planificación** (ya no un parámetro fijo
>    de config): Cofersa CR = 1 día; mayoreo VE = dinámica (pendiente con comercial).
> 5. **Cliente retira = ZONA (D11)**: se modela como una **zona**, no interpretando
>    observaciones. El análisis de observaciones por IA/Bedrock se **desprioriza a
>    futuro** (no en esta entrega).
> 6. **Cambio de prioridad sin anular (D12)** y **backorder/inventario como nueva
>    responsabilidad del OMS (D13)** — ver FR nuevos.
>
> **Lo que v3 corrigió sobre v2 (se mantiene)**: reemplazo del WMH desde la salida
> (D1–D2), rediseño del flujo en alcance (D4), Calendario de Rutas del OMS
> eliminado (D5), multi-compañía por **scope** (C3-SUPERSEDE), jerarquía
> País→Almacén→Cliente. Correcciones de esta re-corrida v4 frente a v3 de la lista
> de arriba. No se re-abren C1 (stack Python/Lambdas/SAM) ni C3.
>
> --- (texto histórico de la re-corrida v3, conservado para trazabilidad) ---
> Correcciones de la re-corrida v3 frente a v2:
>
> 1. **Reemplazo del WMH DESDE LA SALIDA** (no progresivo): el OMS y
>    Planificación reemplazan al WMH (Control Tower), no lo van sustituyendo
>    incremental (D1/D2). Lo que se reemplaza está en `docs/wmh-actual/`.
> 2. **El rediseño del flujo** pedido → TMS → OMS → WMS **entra en alcance** (D4).
> 3. **Calendario de Rutas del OMS eliminado** (D5): FR12 se retira del cuerpo y
>    pasa a "Fuera de alcance" con nota de deprecación (ruteo dinámico, "la ruta
>    manda"). La épica E8/US28–US29 se retira en User Stories.
> 4. **Multi-compañía por SCOPE** (C3-SUPERSEDE): reglas con scope
>    CUSTOMER→WAREHOUSE→COUNTRY→GLOBAL en Lambdas compartidas por función — NO
>    "una Lambda por compañía". Confirmado contra el código (`user_scopes`).
> 5. **Jerarquía País→Almacén→Cliente→Cliente Final** como contexto de datos y
>    aislamiento por scope que el OMS consume (02-to-be §2, ya implementada en el
>    módulo `context`).
>
> Se mantiene intacto lo firme de v2: T-1, score ponderado, IA de observaciones,
> Simulador-configurador, cola, panel/auditoría, seguridad. **No se re-abren** C1
> (stack Python/Lambdas/SAM, confirmado) ni C3 (confirmado). C2 (dónde vive el
> motor de reglas: portar el AST TS→Python vs. motor nuevo) se resuelve en
> Domain Design.

## Análisis de intención

El objetivo de negocio es **automatizar la priorización de alistamiento de
pedidos** que hoy realiza manualmente la Torre de Control (WMH). Con el pivote de
alcance, el OMS —junto con Planificación— **reemplaza al WMH desde la salida**,
no de forma progresiva (D1).

**Flujo invertido (D7) — orden vigente:**

1. **Planificación** extrae de EFLOW los pedidos disponibles (`estado/situación =
   DISP`), los procesa y les **asigna el viaje**. *(Esto NO es del OMS.)*
2. Planificación **escribe el número de viaje de vuelta a EFLOW** y lo deja en
   `public.orders` (`wms_trip_number`).
3. Planificación **invoca al OMS mediante una lambda de activación** (nueva),
   pasándole el lote/corrida a priorizar. **El OMS deja de dispararse por
   cron/EventBridge sobre EFLOW**: ahora lo activa Planificación.
4. El OMS **lee esos pedidos de `public.orders`** (los que Planificación ya
   procesó y tienen viaje), **aplica las reglas** y **escribe de vuelta a EFLOW**:
   estado sigue `DISP`, **situación `= GENE`** y la **prioridad**. Con eso el
   pedido queda **"alistado"** y el WMS/EFLOW genera el picking.

El OMS ya no es quien "extrae de EFLOW y decide quién entra"; es el **priorizador
que Planificación activa** sobre un lote ya procesado y con viaje. El contrato de
esa invocación (qué manda Planificación: filtro, país/compañía, lista de pedidos o
id de corrida) se define en FR0 y se detalla en Domain Design.

Lo que el OMS **busca lograr**:

- Sustituir los "clicks" manuales de la Torre de Control por un motor de reglas
  auditable, para no depender de que un operador lea ~400–500 observaciones/día.
- Decidir **cuándo** preparar cada pedido (regla de fecha T-1) y con qué
  **prioridad** (número invertido), evitando el alistamiento prematuro (satura
  el muelle) y el tardío (pierde el viaje).
- Operar **multi-país y multi-compañía** (Cofersa, EPA… en CR/VE) con reglas
  específicas resueltas por **scope** (país → almacén → cliente).

**El ciclo funcional del OMS (D7, orden vigente):**
Planificación procesa y asigna viaje → Planificación **activa al OMS** (lambda) →
el OMS **lee de `public.orders`** los pedidos del lote (ya con viaje) →
enriquecimiento/evaluación de reglas → priorización → **escritura de vuelta a
EFLOW** (situación `GENE` + prioridad; estado sigue `DISP`) → Auditoría.

**Alcance del OMS (D7/D8)**: el OMS **lee de `public.orders`** los pedidos que
Planificación ya procesó y dejó con viaje, aplica las reglas, **actualiza en
`public.orders`** el resultado (prioridad, `oms_score`, `wms_situation = GENE`,
`handoff_status`, `prioritization_run_id`) y **escribe de vuelta a EFLOW** la
situación `GENE` + la prioridad para disparar el picking. El OMS **no** escribe el
número de viaje (lo escribe Planificación) ni toca las tareas de picking: solo
mueve **disponible → generada** con su prioridad.

**Frontera OMS ↔ Planificación (D7)**: Planificación es quien **activa** al OMS
(lambda de activación, FR0) tras asignar el viaje, y comparte el estado del pedido
en **`public.orders`** (ambos módulos operan sobre esa tabla; Planificación
escribe el viaje, el OMS escribe prioridad + situación). Planificación —módulo
aparte, intent `260825-route-planning-reqs`— arma los viajes **antes** de activar
al OMS. Este requirements cubre **solo el OMS**; no absorbe los FR de
Planificación.

> **Nota (D7/D8 SUPERSEDE de D6)**: queda superado el modelo de v3 (D6) de "dos
> escrituras: tabla propia del OMS en esquema OMS + situación en el WMS", en dos
> puntos: (1) **el flujo se invierte** — el OMS ya no extrae de EFLOW ni se
> auto-dispara; Planificación lo activa y el OMS lee de `public.orders`; (2) **no
> hay tabla `oms.pedidos`** — la tabla del OMS **es `public.orders`** (esquema
> único `public`, ya aplicado en BD 2026-10-16); la "escritura 1" es un UPDATE a
> `public.orders`. Se mantiene: el OMS no escribe fechas, prioridad numérica
> invertida, y el WMS genera el picking con situación `GENE`.

**Fuera de alcance** (de otros módulos o a futuro): creación/asignación del
**viaje** y el **armado de rutas / "Nuevo Viaje"** (Planificación/TMS — su propio
intent); picking y guía de carga (WMS/TMS); ruteo de entrega; facturación/
despacho (TMS, por compañía); validación de inventario por línea; y el
**Calendario de Rutas del OMS** (FR12 v2, **retirado** por D5 — ver más abajo).
El OMS **no** modifica el WMH ni lee las tablas intermedias.

> **Nota de reversión (D4)**: el rediseño completo del flujo pedido → TMS → OMS →
> WMS, que en v2 estaba "fuera de alcance a futuro", **entra en alcance** con el
> reemplazo del WMH desde la salida. El OMS se diseña como pieza de ese flujo de
> reemplazo, no como añadido incremental sobre el WMH.

### Actores (roles del OMS, de la Adenda del 2026-08-26)

| Rol | Responsabilidad en el OMS |
|---|---|
| **Administrador de Módulo** | Configura el **catálogo de reglas** (activar/desactivar, peso/score, parámetros) por scope; superusuario del módulo (no del TMS completo). |
| **Jefe de Almacén** | Visibilidad y reportería del módulo; acceso a la planificación. **No bloquea ni aprueba** el flujo. |
| **Responsable del OMS** | Monitorea el motor automatizado; ejerce el **override manual** (única intervención humana sobre el cálculo) y decide aplicar simulaciones. |

> El rol **Operador de Despacho** que en v2 mantenía el "calendario de rutas del
> OMS" se retira de este alcance junto con FR12 (D5): las rutas ya no son fijas.
>
> El cálculo de prioridad es **100 % automático**; **no existe** paso de
> aprobación humana antes del alistamiento (Adenda 2026-08-26). La única
> intervención humana es el **override manual** por un rol autorizado.

## Glosario

- **OMS**: módulo que, **activado por Planificación** (D7), lee los pedidos del
  lote desde **`public.orders`**, calcula/aplica la prioridad y **escribe de vuelta
  a EFLOW** (situación `GENE` + prioridad) para disparar el picking (D7/D8).
- **EFLOW**: el **WMS** (sistema de gestión de almacén); su BD es `EFLOW_OLO`.
  Genera las tareas de picking cuando la situación pasa a `GENE`. Fuente original
  de los pedidos (ingeridos a `public.orders`).
- **EPRAC**: módulo que **parte los pedidos de EPA por línea** en dos expediciones
  (mismo número + guion-0 / guion-1) y les **pre-asigna la prioridad** (0 = falla,
  1 = regular). El OMS respeta esa prioridad para EPA (FR6b).
- **lambda de activación**: función nueva que **Planificación invoca** para activar
  al OMS sobre un lote/corrida ya procesado (FR0); reemplaza el disparo por
  cron/EventBridge.
- **`public.orders`**: tabla única (esquema `public`, Aurora `tms_olo`) donde viven
  los pedidos (= `EXPEDICIONESCABECERA`). Planificación escribe el viaje; el OMS
  escribe prioridad + `wms_situation`. Es la superficie compartida del flujo
  (D7/D8). **No existe `oms.pedidos`** (descartada 2026-10-16).
- **WMH (Control Tower / Torre de Control)**: sistema actual (v4.18.4.4,
  Angular/AG Grid, BD `EFLOW_OLO`) que el OMS + Planificación **reemplazan desde
  la salida** (D1). Su especificación vive en `docs/wmh-actual/`. El OMS **no** lo
  modifica; lo sustituye.
- **Planificación**: módulo que arma los viajes a partir de los pedidos que el
  OMS deja "alistados". Intent propio `260825-route-planning-reqs`.
- **`estado` / `situación`**: campos del pedido en EFLOW. El pedido llega en
  `estado = DISP` / `situación = DISP` (disponible). El OMS lo cambia a
  `situación = GENERADA` para mandarlo a preparar.
- **prioridad**: número **invertido** (menor = mayor urgencia; 0/1 primero).
  Atada a la fecha de despacho.
- **score**: valor ponderado (suma de pesos de las reglas que aplican) que
  determina la prioridad del pedido.
- **Regla T-1**: fecha de listo = fecha de entrega − 1 día (ajustada por
  duración de la ruta y horas de corte). Criterio de decisión; **el OMS no
  escribe esa fecha**.
- **`fecha de expedición planificada`**: la fecha de **entrega** que envía el
  cliente. El OMS la usa como **insumo** y **no la modifica**.
- **cliente retira**: pedido que el cliente recoge; se identifica por su **zona**
  (`delivery_zone`), no por el texto de observaciones (D11); recibe la prioridad
  más alta + agrupación en su viaje/cliente.
- **observaciones**: texto libre del vendedor (dirección, urgencia, cita…). Su
  interpretación por IA (Bedrock) queda **a futuro** (D11); ya no es la fuente de
  "cliente retira".
- **Motor de Reglas**: catálogo de reglas implementadas (lógica en código); la
  UI solo permite activar/desactivar, ajustar peso y parámetros.
- **Simulación**: entidad persistida (bitácora) que aplica un subconjunto de
  reglas activas a un conjunto de pedidos; estados `simulada` / `aplicada`.
- **scope**: ámbito jerárquico **país → almacén → cliente** con el que se aíslan
  los datos y se resuelven las reglas (RBAC por `user_scopes`; un scope sin
  país/almacén/cliente = GLOBAL). **Cofersa `0109`, EPA…** son **clientes**
  (`customers`) dentro de esa jerarquía, no silos de despliegue.
- **jerarquía de datos**: **País → Almacén → Cliente → Cliente Final → Punto de
  entrega** (02-to-be §2, implementada en el módulo `context`). El OMS la
  **consume** como contexto de datos y aislamiento; no la administra.
- **Capa X**: capa de integración/maestros; todas las tablas llevan `país`,
  `almacén` y `cliente` según corresponda (estándar de aislamiento por scope).

## Requerimientos funcionales

### FR0 — Activación del OMS por Planificación (lambda de activación)

Como **Planificación**, quiero activar al OMS pasándole el lote a priorizar, para
que el OMS priorice **después** de que yo asigné los viajes.

- **FR0.1** El OMS se activa mediante una **lambda de activación nueva** que
  **Planificación invoca de forma ASÍNCRONA** (event-driven, fire-and-forget,
  coherente con la arquitectura por eventos del estándar Intelix) tras procesar los
  pedidos y asignarles viaje. El OMS **deja de dispararse** por cron/EventBridge
  sobre EFLOW (NFR1 se reinterpreta: el disparo lo gobierna Planificación, no un
  schedule propio del OMS).
- **FR0.2 (contrato RESUELTO 2026-10-16 — pull por columna + lambda señal)** El
  mecanismo es **columna como fuente de verdad + lambda como disparador**, NO
  llaves en el payload. Planificación guarda los pedidos en `public.orders`, asigna
  viaje (`wms_trip_number`), estampa `planning_run_id` (trazabilidad) y **avisa al
  OMS** por lambda/evento asíncrono (señal; puede llevar IDs para correlación, pero
  **no es la fuente de verdad del lote**). El OMS **resuelve su conjunto de trabajo
  leyendo `public.orders`**: **`wms_trip_number IS NOT NULL AND oms_processed_at IS
  NULL`** (nueva columna `orders.oms_processed_at timestamptz`; NULL = pendiente).
- **FR0.3** El OMS estampa **`oms_processed_at = now()`** al completar el handoff
  (consistente con `handoff_status='completado'`), lo que saca el pedido de la cola.
  **Idempotencia natural por la columna**: si la señal se pierde/reintenta, un
  **barrido periódico** sobre `oms_processed_at IS NULL` recupera el trabajo. El OMS
  procesa **por compañía** (batching propio; Planificación no lo conoce).

*Acceptance (BDD):*
- Given pedidos con `wms_trip_number` asignado y `oms_processed_at IS NULL`, When
  Planificación avisa al OMS (señal) o corre el barrido, Then el OMS los resuelve de
  `public.orders` y los prioriza.
- Given un pedido ya procesado (`oms_processed_at` estampado), When llega otra señal
  o corre el barrido, Then **no** se re-prioriza (idempotencia natural por columna).
- Given que la señal (lambda) se pierde, When corre el barrido periódico, Then el
  trabajo pendiente igual se procesa (la columna es la red de seguridad).

> **Contrato RESUELTO (2026-10-16)** con el dueño de Planificación: pull por columna
> `oms_processed_at` + lambda como señal (reemplaza la OQ previa "scope + run_id vs.
> llaves explícitas"). Las columnas nuevas (`orders.oms_processed_at`,
> `orders.lead_time_days`, `plan_trips.lead_time_days`) van en el PR de tablas del
> dueño de Planificación.

### FR1 — Lectura de la cola de priorización desde `public.orders`

Como sistema, el OMS obtiene de **`public.orders`** los pedidos del lote que
Planificación ya procesó (ya con viaje) para priorizarlos. **(Cambio D7: el OMS ya
no lee de EFLOW `EXPEDICIONESCABECERA`; lee de `orders`.)**

- **FR1.1** La cola se resuelve sobre **`public.orders`** por **pull por columna**
  (FR0.2): **`wms_trip_number IS NOT NULL AND oms_processed_at IS NULL`** — pedidos
  que Planificación dejó con viaje y aún no procesados por el OMS. **Ya no** se lee
  de `EXPEDICIONESCABECERA` ni se filtra por el anti-join con
  `ALMACENMOVIMIENTOS_CARCAM` (eso era el modelo pre-inversión). La misma consulta
  sirve para la señal de la lambda y para el barrido periódico (red de seguridad).
- **FR1.2** Los campos insumo viven en `orders` (poblados desde EFLOW en la carga):
  `delivery_date` (fecha de entrega), `observaciones`, `delivery_zone` (zona — base
  de "cliente retira", D11), `wms_trip_number`, la llave EFLOW
  (`eflow_id_almacen/compania/sucursal/expedicion`) y el `customer_type`
  (`TIENDA`/`MAYOREO`) del `final_customer` para distinguir EPA de Cofersa/mayoreo.
- **FR1.3** El cruce con el detalle (líneas) usa `order_items`
  (= `EXPEDICIONESDETALLE`), por la llave EFLOW.
- **FR1.4** El OMS opera sobre **`public.orders`** (Aurora `tms_olo`), no contra el
  transaccional de EFLOW. La escritura de vuelta a EFLOW (FR8) es aparte.

*Acceptance (BDD):*
- Given un pedido en `orders` con `wms_trip_number` asignado y `wms_situation`
  distinta de `GENE`, When el OMS corre sobre el lote activado, Then el pedido
  entra como candidato a priorizar.
- Given un pedido sin viaje asignado, When Planificación aún no lo procesó, Then no
  es parte del lote que el OMS prioriza (lo activa Planificación, no el OMS).

### FR2 — Cálculo de prioridad por fecha (Regla 1 — T − duración logística)

Como sistema, el OMS decide automáticamente cuándo preparar cada pedido según su
fecha de entrega, para alistar en el momento correcto. **Regla de la primera
entrega. Aplica a Cofersa/mayoreo; NO aplica a EPA (ver FR6b).**

- **FR2.1** El Motor de Reglas usa `delivery_date` (fecha de entrega del cliente,
  desde `orders`/EFLOW) como **insumo**; **no la modifica** y **no escribe ninguna
  fecha nueva** (no existe "fecha de alisto").
- **FR2.2** Regla general (D10): `fecha_listo = fecha_de_entrega −
  duración_logística`. **T-1 es el caso particular** con duración = 1 día.
  - **Cofersa (CR)**: duración **fija = 1 día** (el T-1 clásico).
  - **Mayoreo VE** (Beval/Febeca y las otras 3 compañías): misma regla, pero la
    duración es **dinámica** (días de rodada por clúster/distancia), **calculada
    por Planificación**, no por una tabla de zonas-días. Las rutas/duraciones de VE
    están **pendientes de definir con comercial**.
- **FR2.3** La **duración logística es un insumo por pedido/viaje que entrega
  Planificación** (D10): deja de ser un parámetro fijo del OMS. Mecanismo confirmado
  (2026-10-16): Planificación la calcula en `plan_trips.lead_time_days` y la
  **denormaliza en `orders.lead_time_days`**; el OMS la **lee por pedido** desde
  `orders`. Default = 1 día para Cofersa si no viene. **Limitación conocida (OQ)**:
  el cálculo dinámico por clúster de VE aún no existe; hoy Planificación usa un mapa
  **estático zona→días** (ej. Zona 4 = T-2, resto T-1). El OMS no calcula la
  duración, solo la lee.
- **FR2.4** Horas de corte: si el pedido entra antes del corte de su ruta
  (configurable), se lista para el evento correspondiente; si entra después, rueda
  al siguiente.
- **FR2.5** Cuando la regla se cumple, el OMS pone **situación `= GENE`** (estado
  sigue `DISP`) y asigna la prioridad (número invertido). Si no se cumple, no lo
  genera hasta que corresponda.
- **FR2.6** Fallback: si la compañía no provee la fecha de entrega (caso Cofersa
  hoy, que la llena por default), se aplica el fallback por valor
  centinela/default (ver OQ-3). Como `delivery_date` puede venir con un valor por
  defecto, el disparador del fallback es "fecha = centinela/default", no "fecha
  nula".

### FR3 — Modelo de prioridad numérica y score

- **FR3.1** La prioridad es **numérica e invertida**: menor número = mayor
  urgencia (0/1 se atiende primero). Debe hacer *match* con el esquema del WMS.
- **FR3.2** El motor calcula la prioridad con un **score ponderado**: cada regla
  aplicable suma su peso; el mayor peso corresponde a **cliente retira**, luego
  a la fecha. El score entra en el alcance **desde la primera entrega**.
- **FR3.3** Idealmente el día maneja pocas prioridades (lo de mañana + cliente
  retira); si hay capacidad ociosa se adelantan pedidos de días siguientes.
- **FR3.4** Existe un **umbral de inyección**: el OMS solo prepara pedidos hasta
  cierta prioridad (el resto espera). El umbral es configurable (ver OQ-5).
- **FR3.5** El resultado de cada priorización queda **auditable** con la regla,
  su versión y los factores que la produjeron (base para `decision_log` /
  `rule_execution_log` del diseño objetivo).

### FR4 — Override manual de prioridad

Como **Responsable del OMS** (rol autorizado), quiero alterar la prioridad de un
pedido puntual, para casos extraordinarios (camión accidentado, urgencia).

- **FR4.1** Un rol autorizado puede cambiar la prioridad de un pedido; exige un
  **motivo obligatorio** y queda registrado en la Auditoría como cambio
  **manual**.
- **FR4.2** El override es la **única** intervención humana sobre el cálculo; no
  hay aprobación de lote.
- **FR4.3** Un usuario sin permiso de override no puede alterar la prioridad
  (acción denegada). El permiso se resuelve por la matriz de permisos módulo ×
  acción y el scope del usuario.
- **FR4.4 (cambio sin anular, D12)** Mientras el pedido esté **disponible** o
  **disponible/generada**, la prioridad se **modifica reenviando el registro** — no
  hace falta anular ni revertir. El OMS **no reordena tareas ya generadas**. **Solo
  el cambio de la fecha de entrega pasa por Planificación** (replanifica), no por
  el OMS.

### FR5 — Motor de Reglas (catálogo semi-configurable)

Como **Administrador de Módulo**, quiero un catálogo de las reglas implementadas
que pueda activar/desactivar y parametrizar, para el rollout por etapas — **sin
crear reglas nuevas desde la UI** (su lógica vive en código).

- **FR5.1** El Motor de Reglas es un **catálogo** de las reglas implementadas;
  por cada regla se muestra nombre, descripción, estado (toggle
  activar/desactivar), peso/score (editable) y parámetros editables. **No** es un
  constructor dinámico de reglas.
- **FR5.2** Parámetros editables por regla, según la regla: días de T-1, horas
  de corte, umbral de inyección, patrón/prioridad/ventana de cliente retira.
- **FR5.3** El catálogo y sus reglas se resuelven **por scope**
  (CUSTOMER → WAREHOUSE → COUNTRY → GLOBAL): un selector de scope (país/almacén/
  cliente) cambia qué reglas y parámetros aplican. La especificidad por compañía
  se logra con una regla de scope=CUSTOMER (Cofersa/EPA son clientes), no con una
  Lambda por compañía (C3-SUPERSEDE).
- **FR5.4** La lógica de cada regla y, cuando aplica, su **prompt de IA**, viven
  en el código (Lambda Python); **no** son editables desde la UI.

### FR6 — Las macro-reglas

- **FR6.1 (Regla 1 — cálculo de fecha, T − duración)**: ver FR2. **Primera
  entrega.** Aplica a Cofersa/mayoreo; **no a EPA** (FR6b).
- **FR6.2 (Regla "cliente retira" = ZONA, D11)**: el "cliente retira" se modela
  como una **zona** (`delivery_zone`), **no** interpretando observaciones. Un
  pedido cuya zona es la de "cliente retira" recibe la prioridad más alta y se
  agrupa en el viaje/cliente correspondiente. **Primera entrega.**
- **FR6.3 (Regla 2 — análisis de observaciones por IA)**: **FUTURO (desprioritizado
  D11)**. Interpretar el texto libre de `observaciones` con un modelo de IA
  (Bedrock) queda **fuera de esta entrega**; "cliente retira" ya no depende de la
  IA sino de la zona (FR6.2). Ver FR7 (marcado futuro).
- **FR6.4 (Regla 4 — asignación de viaje/bajada)**: **fuera de alcance**. El viaje
  lo asigna **Planificación** (que además activa al OMS, D7); el OMS **no** crea ni
  asigna el viaje. La asignación de bajada/muelle queda futura.
- **FR6.5 (Regla 5 — inventario / backorder)**: **entra en alcance como nueva
  responsabilidad del OMS (D13)**. Ver FR6c.

### FR6b — EPA: prioridad pre-asignada por EPRAC (sin cálculo)

Como sistema, para los pedidos de **EPA** el OMS **no calcula** la prioridad:
viene **pre-asignada** y el OMS solo libera. **Primera entrega.**

- **FR6b.1** **EPRAC** parte el pedido de la tienda EPA en **dos expediciones con
  el mismo número + guion**: **guion-0** = artículos en falla = **prioridad 0** (la
  más alta); **guion-1** = regular = **prioridad 1**.
- **FR6b.2** El OMS **no recalcula** la prioridad de EPA (no aplica T-1 ni score):
  toma la prioridad que ya traen (0/1) y pone **ambas expediciones en situación
  `GENE`**, liberándolas **juntas**.
- **FR6b.3** EPA se distingue por `customer_type = TIENDA` (y/o el código de
  compañía EPA) en `orders`/`final_customers`.

### FR6c — Backorder / inventario (nueva responsabilidad del OMS, D13)

Como sistema, el OMS re-genera automáticamente las líneas que quedaron en falta
por inventario cuando entra stock, para no depender de que alguien lo haga a mano.

- **FR6c.1** Es un **loop/componente PROPIO y DESACOPLADO** de la ruta de
  priorización: **no** vive dentro del handoff de la corrida ni de la lambda de
  activación (FR0). Es una **revisión continua / por evento**, no parte del disparo
  de un lote.
- **FR6c.2** Mecánica conceptual: (1) **leer las acciones liberadas que quedaron
  omitidas** por falta de inventario; (2) **chequear inventario**; (3) **re-mandar
  a generar solo esas acciones** (situación `GENE` con su prioridad) cuando entre
  stock. Sin intervención manual.
- **FR6c.3** Aterriza la antigua "Regla 5 (inventario/capacidad)" con **dueño
  explícito = OMS**. Para esta rebanada basta el **esqueleto del componente + las
  open questions**; el diseño fino **no se cierra** aquí.

*Open questions (hechos de integración/negocio para la próxima reunión — NO
inventar):*
- **OQ-BO1** ¿De dónde lee el OMS las **acciones omitidas** en EFLOW? (qué
  tabla / qué estado las marca como omitidas por inventario).
- **OQ-BO2** ¿Cuál es la **fuente de inventario** que consulta el OMS?
- **OQ-BO3** ¿Cuál es el **disparador** del re-chequeo: un **evento de entrada de
  inventario** o un **barrido periódico**?

### FR7 — Análisis de observaciones con IA (Amazon Bedrock) — **FUTURO (D11)**

> **Desprioritizado (D11, 2026-10-16).** Negocio decidió modelar "cliente retira"
> como una **zona** (FR6.2), no interpretando el texto libre de observaciones. El
> análisis de observaciones con IA/Bedrock **no entra en esta entrega**; se
> conserva como requerimiento **futuro** para otras salidas (cambio de dirección,
> cita, urgencia). Lo de abajo queda como especificación diferida.

- **FR7.1 (futuro)** La regla de observaciones se resolvería con un modelo de IA
  nativo de Amazon Bedrock (ultraligero), con el prompt en la Lambda. Hoy **no se
  construye**.
- **FR7.2 (futuro)** El prompt viviría en la Lambda, no editable desde la UI.
- **FR7.3 (futuro)** "cliente retira" ya **no** depende de este análisis (pasó a
  ser zona, FR6.2); las salidas futuras serían cambio de dirección, cita, etc.
- **FR7.4 (futuro)** Costo objetivo < $1 USD/mes (~400 pedidos/día).
- **FR7.5 (futuro)** Degradaría sin bloquear ante fallo/timeout.

### FR8 — Escritura del pedido priorizado (dos escrituras, flujo invertido D7/D8)

Como sistema, el OMS deja el pedido "alistado" con **dos escrituras** (D7/D8).

- **FR8.1 (`public.orders` — resultado del OMS)** El OMS **actualiza el pedido en
  `public.orders`** (UPDATE por la **llave EFLOW** `eflow_id_almacen/compania/
  sucursal/expedicion`) con: `priority` (entero), `oms_score`, `wms_situation =
  GENE`, `handoff_status`, `prioritization_run_id` y **`oms_processed_at = now()`**
  (saca el pedido de la cola pull de FR0.2/FR1.1). Escritura **atómica** (nunca
  `GENE` sin prioridad). El pedido **ya existe** en `orders` (lo cargó la ingesta
  desde EFLOW y es lo que Planificación procesó); si no existe, es un error (no se
  priorizan pedidos no ingeridos). **No hay tabla `oms.pedidos`** (D7 SUPERSEDE de
  D6: esquema único `public`).
- **FR8.2 (EFLOW real — disparo de picking, D8)** El OMS **escribe de vuelta a
  EFLOW** sobre `EXPEDICIONESCABECERA`: **situación `TPEXSI = GENE`** (el estado
  `TPEXES` **permanece `DISP`**) **y la prioridad `PRIORIDAD`**. El flag
  `escribir_prioridad_al_wms` queda en **TRUE** (confirmado D8: la prioridad **sí**
  se escribe en EFLOW). El OMS **no** escribe el `wms_trip_number` (lo escribe
  Planificación) ni toca las tareas de picking.
- **FR8.3 No escribe fechas.** `delivery_date` / `FECHAEXPEDICIONPLANIFICADA`
  quedan intactas (invariante NFR7); no existe "fecha de alisto".
- **FR8.4 Orden e idempotencia.** Escritura 1 (`orders`, Aurora) **antes** de la 2
  (EFLOW). Sin 2PC entre Aurora y SQL Server: si la 2 falla, el pedido queda
  `handoff_status = disparo_pendiente` y se **reintenta idempotente** por la llave
  EFLOW (re-correr no duplica ni re-dispara). (`ponytail:` dos stores, orden +
  reintento; upgrade = outbox/reconciliación.)

> **(D7/D8 SUPERSEDE de D6)**: ya no existe "tabla propia del OMS en esquema OMS";
> la escritura 1 es un **UPDATE a `public.orders`**, y la escritura 2 va a **EFLOW
> real** con prioridad incluida. El número de viaje lo pone Planificación, no el
> OMS.

### FR9 — Simulador (configurador de simulaciones)

Como **Developer**, quiero configurar, previsualizar y aplicar simulaciones de
priorización, manual o automáticamente.

- **FR9.0** La vista Simulador es **visible y accesible SOLO para el rol
  `Developer`**. Para cualquier otro rol (usuarios normales, Administrador de
  Módulo, Jefe de Almacén, Responsable del OMS) la vista **no es visible**: no
  aparece en la navegación y su ruta queda denegada por la matriz de permisos
  (FR14). Cambio del 2026-10-01: antes era operada por el Responsable del OMS;
  ahora queda restringida a `Developer` (herramienta de diagnóstico/pruebas).
- **FR9.1** Al simular se aplican **solo las reglas ACTIVAS**. Un **modal previo**
  trae por defecto todas las activas y permite elegir un subconjunto para esa
  corrida.
- **FR9.2** En el modal previo se filtra el conjunto de pedidos por
  `situación`/`estado` (`DISP`, `GENERADA`…), a todos o a un subconjunto —
  incluido **re-simular sobre prioridades ya asignadas**.
- **FR9.3** El resultado se muestra como una **tabla igual que la Cola** (todas
  las columnas / selección de columnas).
- **FR9.4** La **Simulación es una entidad persistida** (bitácora): fecha, autor
  (usuario o automático), reglas usadas, filtro aplicado, estado
  (`simulada`/`aplicada`), scope. Pueden existir varias `simuladas`, pero **solo
  una `aplicada` por scope de compañía/cliente** (la última, o la que el usuario
  elija).
- **FR9.5** Aplicación **manual / automática / mixta**: manual = el usuario
  revisa y pulsa "Aplicar"; automática = se genera y aplica sola; mixta = se
  genera automáticamente con **ventana de revisión** y **hora de corte** (si
  nadie interviene antes, se aplica sola).
- **FR9.6** Configuración por scope: número de simulaciones/día,
  frecuencia/horarios, filtro de situación por simulación y modo de aplicación
  por simulación.

### FR10 — Cola de Priorización (pantalla operativa)

- **FR10.1** La Cola entra por defecto filtrada en `situación = DISP` (+
  `fecha_de_cierre IS NULL`); el usuario puede cambiar a otras situaciones.
- **FR10.2** Se **mantiene el filtro de almacén** y se ofrece un **selector de
  scope país/almacén/cliente** dentro de la vista (no por perfil). Un mismo
  perfil ve los scopes que su RBAC permite (Cofersa/EPA como clientes).
- **FR10.3** Se muestra el **nombre** de la compañía/cliente (resuelto contra el
  maestro, no el código crudo).
- **FR10.4** El usuario puede **elegir qué columnas** ve; la preferencia se
  guarda en una tabla `User Preference` (campo JSON).
- **FR10.5** El **detalle del pedido** se muestra en un **modal** (no panel
  lateral), para que la tabla use todo el ancho.
- **FR10.6** Desde el detalle, un rol autorizado puede ejecutar el **override
  manual** (FR4).

### FR11 — Panel OMS y Auditoría

- **FR11.1** El Panel muestra la salud del motor e indicadores operativos.
- **FR11.2** El indicador **% de override manual** usa una **ventana temporal
  configurable** (24 h / 12 h / semana), no fija. Los datos de métricas se
  retienen ~3–5 meses.
- **FR11.3** La **Auditoría** registra las priorizaciones ejecutadas
  distinguiendo **automático vs. manual** (usuario y motivo en el caso manual);
  es de solo lectura. Se apoya en la bitácora de auditoría por trigger de BD ya
  existente (`audit.events`).

### FR12 — (RETIRADO por D5 — ver "Fuera de alcance")

> **FR12 (Calendario de rutas y días de despacho) queda RETIRADO** de los
> requerimientos activos del OMS. Con el ruteo dinámico multi-fuente ("la ruta
> manda", D5 + mandato de Jean Carlo), las rutas dejan de ser fijas, así que no
> hay un "calendario de rutas" que el OMS mantenga o consulte como catálogo. Se
> conserva aquí solo como marca de deprecación para trazabilidad; su texto
> completo y su épica (E8/US28–US29) se retiran. Ver "Fuera de alcance".

### FR13 — Multi-país y multi-compañía (por scope)

- **FR13.1** Las reglas específicas se resuelven **por scope**
  (CUSTOMER → WAREHOUSE → COUNTRY → GLOBAL) en **Lambdas compartidas por
  función**, no con una Lambda por compañía (C3-SUPERSEDE, confirmado contra el
  código `user_scopes`). La regla de scope=CUSTOMER preserva la especificidad por
  compañía (Cofersa/EPA son clientes).
- **FR13.2** En la UI, el scope es un **filtro/selector dentro de la vista** (un
  mismo perfil ve los scopes que su RBAC permite); **no** hay silo por perfil de
  compañía.
- **FR13.3** El **país** es el nivel superior de la jerarquía de scope (no un
  filtro aparte pegado); `EPA GT`, `EPA VE` se modelan como cliente dentro de su
  país.
- **FR13.4** **Aislamiento fail-closed**: ninguna operación de un scope lee ni
  escribe datos de otro; se garantiza en el repositorio (no solo en la UI), sobre
  la jerarquía País→Almacén→Cliente→Cliente Final. El nombre de la compañía se
  resuelve con un **maestro**, no consultando EFLOW en cada lectura.

### FR14 — Seguridad y control de acceso

- **FR14.1** El OMS diferencia niveles de acceso por la **matriz de permisos
  módulo × acción** (`view/create/edit/delete/export`) más el **scope** del
  usuario: visualización, operación (override, consulta de auditoría) y
  administración (catálogo de reglas, configuración de simulaciones).
- **FR14.2** Delega autenticación y tokens a la capa de seguridad transversal del
  TMS (authorizer JWT de `common-services`); resuelve la autorización validando el
  token contra la acción y el scope.
- **FR14.3** Toda acción de escritura registra el identificador del usuario en la
  Auditoría (bitácora por trigger de BD; sin usuario = `system`).
- **FR14.4** La vista **Simulador** (FR9) está restringida al rol **`Developer`**:
  solo ese rol la ve en la navegación y puede acceder a su ruta; para cualquier
  otro rol la vista no es visible y su acceso se deniega fail-closed por la matriz
  de permisos. (Cambio del 2026-10-01.)

## Requerimientos no funcionales

> Umbrales **provisionales**, a validar con volumen real.

- **NFR1 — Frecuencia del motor**: el motor de reglas corre **al menos una vez
  al día** (primera hora) y en las **horas de corte**, revisitando prioridades.
- **NFR2 — Costo de IA**: el análisis de observaciones con Bedrock cuesta
  **< $1 USD/mes** para ~400 pedidos/día (texto ~40 caracteres).
- **NFR3 — Volumen**: referencia ~**400–500 pedidos/día** (Cofersa).
- **NFR4 — Capacidad operativa**: ~**80 pedidos** en proceso simultáneo; los
  demás esperan en cola aunque tengan prioridad.
- **NFR5 — Aislamiento multi-scope**: ninguna operación de un país/almacén/
  cliente lee ni escribe datos de otro; se garantiza por `user_scopes` y el
  filtrado en el repositorio (fail-closed).
- **NFR6 — Auditabilidad**: los registros de auditoría son de solo lectura;
  retención de métricas ~3–5 meses; bitácora particionada por mes.
- **NFR7 — No modificación de fechas**: el OMS nunca escribe fechas en EFLOW
  (invariante verificable).
- **NFR8 — Consistencia de UI**: las pantallas del OMS se componen con el design
  system existente (React), sin kits de UI nuevos.
- **NFR9 — Lectura sobre réplica**: las consultas van contra la réplica de
  `EFLOW_OLO`, no contra el transaccional (depende de OQ-2; hoy mock).
- **NFR10 — Stack de construcción**: el OMS se construye sobre el stack oficial
  Intelix — **backend Python + AWS Lambda + SAM**, Aurora PostgreSQL, frontend
  React (C1, confirmado contra el código). La lógica del motor de reglas corre en
  el **backend** (no en el frontend; la TS actual es deuda del prototipo).

## Restricciones

- **C1 — Flujo invertido y doble escritura (D7/D8)**: Planificación **activa** al
  OMS; el OMS **lee de `public.orders`**, **actualiza `public.orders`** (prioridad,
  score, `wms_situation = GENE`) y **escribe de vuelta a EFLOW** (`TPEXSI = GENE` +
  `PRIORIDAD`). No hay tabla `oms.pedidos`; no toca el WMH ni el picking.
- **C2 — El OMS no arma el viaje ni se auto-dispara**: el armado del viaje/ruta y
  la **activación** del OMS son de **Planificación**; el OMS prioriza el lote que
  recibe y escribe el resultado.
- **C3 — El OMS no escribe fechas**: usa la fecha de entrega como insumo.
- **C4 — Stack oficial Intelix**: AWS (serverless), **Python + Lambdas** (backend),
  **React** (frontend), **PostgreSQL/Aurora**, plantillas SAM. Solo Intelix
  despliega. El prototipo Supabase (Readdy) **no** es el target. (Confirmado
  contra el código: `backend/` es Python/SAM.)
- **C5 — Multi-tenancy por scope**: aislamiento país→almacén→cliente vía
  `user_scopes`, en Lambdas compartidas por función; **no** una Lambda por
  compañía (C3-SUPERSEDE).
- **C6 — Reglas en código**: la lógica de las reglas (y los prompts de IA) vive
  en Lambdas Python, no se arma desde la UI.
- **C7 — Reemplazo del WMH desde la salida** (D1): el OMS + Planificación
  sustituyen al WMH; el diseño del OMS es pieza del flujo de reemplazo, no un
  añadido incremental.

## Supuestos

- **A1** El WMH (Control Tower) se reemplaza **desde la salida** (no en paralelo
  progresivo); su especificación de referencia está en `docs/wmh-actual/`.
- **A2** El pedido llega en `estado = DISP` / `situación = DISP` al WMS; el OMS
  lo activa cambiando la situación a `GENERADA`.
- **A3** El motor puede regenerar/revisitar prioridades salvo cuando el pedido ya
  está al 100 %.
- **A4** Los umbrales de NFR son provisionales hasta conocer el volumen real.
- **A5** La jerarquía País→Almacén→Cliente→Cliente Final ya está implementada
  (módulo `context`); el OMS la consume, no la administra.

## Fuera de alcance

- **Calendario de Rutas del OMS (ex-FR12 v2) — RETIRADO por D5.** Con el ruteo
  dinámico multi-fuente ("la ruta manda"), las rutas dejan de ser fijas; ya no hay
  un calendario de rutas que el OMS mantenga (CRUD gated a admin) ni consulte.
  Supera los DECIDED previos "vista Calendario de Rutas ACOTADO — solo consulta"
  (2026-09-15) y "fuente de verdad del calendario en el TMS, el OMS consume"
  (2026-09-02). La épica E8 (US28–US29) se retira en User Stories.
- **Armado de viajes / ruteo dinámico / "Nuevo Viaje" del WMH** — es de
  **Planificación** (intent `260825-route-planning-reqs`), no del OMS.
- Inserción a un "lago de datos" (**eliminado**; el OMS escribe a nivel WMS).
- Picking, guía de carga, ruteo de entrega (WMS/TMS); facturación/despacho (TMS).
- Regla 5 (inventario/capacidad) y priorización por línea — futuro.
- Aprobación humana de la propuesta de priorización — no existe.

## Open Questions

- **OQ-1 — Base de datos**: `logistica_olo`/`tms_olo` con `país`/`almacén`/
  `cliente` como columnas de scope; dirección actual, a confirmar con arquitectura.
- **OQ-2 — Réplica de `EFLOW_OLO`**: **no existe** hoy (EFLOW en mock); hay que
  solicitarla. Bloqueante para leer sin pegar al transaccional.
- **OQ-3 — Fecha de entrega de Cofersa**: hoy Cofersa **no** envía la fecha de
  entrega. Sin ella, la Regla 1 usa el fallback por ruta.
- **OQ-4 — Tabla de prioridades del cliente**: los números 1..N que define el
  cliente están pendientes de entrega.
- **OQ-5 — Score vs. filtro estricto y umbral de inyección**: el modelo de score
  ya está decidido; queda cerrar si alguna regla es obligatoria (filtro) además de
  sumar peso, y a partir de qué prioridad se inyecta.
- **OQ-6 — Duración de rutas y horas de corte**: las define el equipo de
  transporte; hay que crear la regla de cortes.
- **OQ-7 — Nomenclatura del viaje de cliente retira**: cómo el TMS genera el
  viaje/ruta 0 de cliente retira y su identificador.
- **OQ-8 (nueva) — Gap peso/volumen del handoff**: `wms_expediciones` (header) no
  trae peso/volumen (vienen de `EXPEDICIONESCABECERA` en EFLOW, hoy mock); llegan
  como `null`/`capacity_known:false`. Es dependencia del handoff a Planificación,
  no del cálculo de prioridad del OMS.

## Sources

- `aidlc/spaces/default/memory/project.md` (`## Decided` — pivote D1–D5,
  C3-SUPERSEDE, mandato de Jean Carlo; `## Corrections`).
- `docs/work/2026-09/2026-09-29-pivote-reemplazo-wmh.md` — D1–D5.
- `docs/wmh-actual/` (indexado en DocumentKB) — el WMH que se reemplaza.
- `docs/arquitectura-tms-oms/02-to-be.md` §2 (jerarquía), §4 (RBAC por scope),
  §5 (pipeline OMS).
- `aidlc/spaces/default/codekb/sto_tms_olo/` (business-overview, architecture,
  code-structure, api-documentation, code-quality-assessment — regenerados
  2026-09-30 contra el backend Python/SAM: `wms_expediciones`, scope
  país→almacén→cliente, gap peso/volumen). El árbol real (`code-structure`)
  confirma `backend/` (Lambdas Python/SAM) y `src/` (React + motores TS).
- Documentos de reunión (Antonio 09-08, Calzadilla 09-14, diseño 09-14, simulador
  09-15, roles 08-26) — invariantes del motor, T-1, cliente retira, simulador.

## Assumptions & Open Questions

Ver **Supuestos** (A1–A5) y **Open Questions** (OQ-1 a OQ-8). Lo abierto depende
de datos/arquitectura/cliente (BD, réplica, fecha de Cofersa, tabla de
prioridades, score-vs-filtro, cortes, viaje cliente retira, gap peso/volumen) y no
bloquea la aprobación de estos requerimientos. **C2** (dónde vive el motor de
reglas: portar el AST TS→Python para un motor compartido OMS+TMS, o motor nuevo en
Python, con tests de regresión sobre Liquidaciones) se resuelve en Domain Design.

**Consecuencia de D7/D8 para Domain Design** (SUPERSEDE de la consecuencia de D6):
la superficie del OMS **es `public.orders`** (esquema único `public`, ya aplicado
en BD 2026-10-16), **no** una tabla propia en esquema OMS. Domain Design debe
reflejar: (a) la **lambda de activación** (FR0) como nuevo componente/puerta de
entrada; (b) `ColaCandidatos` leyendo de `public.orders` (no de
`EXPEDICIONESCABECERA`); (c) `HandoffPedidosOMS` con escritura 1 = UPDATE a
`public.orders` y escritura 2 = EFLOW real (`TPEXSI = GENE` + `PRIORIDAD`); (d) la
**regla EPA** (prioridad pre-asignada por EPRAC, sin cálculo); (e) la **regla
fecha generalizada** (duración como insumo de Planificación); (f) **cliente
retira = zona** (no observaciones); (g) `AnalizadorObservaciones` **diferido a
futuro**; (h) nuevo componente de **backorder/inventario** (D13).
