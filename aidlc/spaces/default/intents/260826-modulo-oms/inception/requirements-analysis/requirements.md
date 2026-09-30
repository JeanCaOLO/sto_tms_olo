# Requerimientos — Módulo OMS (Order Management System)

> Intent: `260826-modulo-oms`. Etapa: Requirements Analysis (Inception,
> **re-corrida por el pivote de reemplazo del WMH**, 2026-09-30). Proyecto
> brownfield `sto_tms_olo`. Idioma: español.
>
> Esta versión **corrige quirúrgicamente** la anterior (v2, 14 FR) a la luz del
> pivote (`project.md` `## Decided` D1–D5 y C3-SUPERSEDE, 2026-09-29) y del
> codekb regenerado el 2026-09-30 contra el código real (backend Python/SAM).
> Correcciones de esta re-corrida frente a v2:
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
no de forma progresiva (D1). El OMS es el eslabón que se posiciona entre los
pedidos del WMS/EFLOW y su preparación: **lee** los pedidos, **aplica reglas de
negocio** para decidir cuáles se preparan y con qué prioridad, y **escribe de
vuelta en el WMS/EFLOW** cambiando el `estado`/`situación` del pedido (de `DISP`
a `situación = GENERADA`) y su **prioridad**. Con eso, el WMS genera
automáticamente las tareas de picking, y el pedido queda **"alistado"** para que
**Planificación** arme el viaje.

Lo que el OMS **busca lograr**:

- Sustituir los "clicks" manuales de la Torre de Control por un motor de reglas
  auditable, para no depender de que un operador lea ~400–500 observaciones/día.
- Decidir **cuándo** preparar cada pedido (regla de fecha T-1) y con qué
  **prioridad** (número invertido), evitando el alistamiento prematuro (satura
  el muelle) y el tardío (pierde el viaje).
- Operar **multi-país y multi-compañía** (Cofersa, EPA… en CR/VE) con reglas
  específicas resueltas por **scope** (país → almacén → cliente).

**El ciclo funcional del OMS** (Figura 7 del pivote, se mantiene):
Ingreso de pedidos (WMS/réplica) → Enriquecimiento de datos → Evaluación de
reglas → Priorización → Handoff a Planificación (situación `GENERADA`) →
Auditoría.

**Alcance del OMS**: el OMS **lee** los pedidos del WMS/EFLOW, aplica las reglas
y **cambia ciertos campos de esos registros a nivel del WMS** (`estado`/
`situación` + prioridad). **Hasta ahí llega el OMS.** El WMS/EFLOW genera las
tareas de picking cuando la situación queda en `GENERADA`; a partir de ahí el
pedido pasa a **Planificación** (armado del viaje).

**Frontera OMS ↔ Planificación** (handoff): el OMS deja el pedido **alistado**
(`situación = GENERADA`, sin viaje asignado) en la base intermedia que consume
Planificación (hoy `wms_expediciones` en Aurora). **Planificación** —módulo
aparte, con su propio intent `260825-route-planning-reqs`— lo toma para armar los
viajes (ruteo dinámico multi-fuente). Este requirements cubre **solo el OMS**; no
absorbe los FR de Planificación.

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

- **OMS**: módulo que lee pedidos del WMS/EFLOW, calcula prioridad y cambia su
  `estado`/`situación` para dejarlos "alistados" (listos para picking).
- **WMS / EFLOW**: sistema de gestión de almacén; genera las tareas de picking
  cuando la situación pasa a `GENERADA`. Fuente de los pedidos.
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
- **cliente retira**: pedido que el cliente recoge; se detecta por observación y
  recibe la prioridad más alta + viaje/cliente "dummy".
- **observaciones**: texto libre del vendedor (dirección, urgencia, cita,
  cliente retira…); se interpreta con un modelo de IA (Amazon Bedrock).
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

### FR1 — Lectura de la cola de priorización desde el WMS/EFLOW

Como sistema, el OMS obtiene de EFLOW los pedidos candidatos a priorizar.

- **FR1.1** La cola se resuelve sobre `expedición_cabecera`: pedidos con
  `fecha_de_cierre IS NULL` y `estado`/`situación` = `DISP` (y sin
  `NUMEROVIAJEWMH`, es decir sin viaje asignado). Equivale al anti-join con
  `almacén_movimiento_carcam` (los no procesados). En el código actual, el puente
  hacia Planificación es la tabla staging `wms_expediciones` (situación `GENE`).
- **FR1.2** Para progreso/detalle, el OMS puede cruzar con `expedición_detalle`
  y `almacén_movimiento_carcam` por `pedido + almacén + compañía + sucursal`.
- **FR1.3** `Journey_Orders` es **opcional** (solo para ver a qué viaje está
  asignado un pedido); no interviene en decidir la prioridad.
- **FR1.4** El OMS lee sobre la **réplica** de `EFLOW_OLO`, no contra el
  transaccional. (Dependencia externa: la réplica **aún no existe**, ver OQ-2;
  hoy EFLOW corre en modo mock.)

*Acceptance (BDD):*
- Given un pedido con `fecha_de_cierre IS NULL` y `situación = DISP` sin viaje,
  When el OMS lee la cola, Then el pedido aparece como candidato a priorizar.
- Given un pedido ya presente en `almacén_movimiento_carcam`, When el OMS lee la
  cola, Then el pedido NO aparece (ya está en proceso).

### FR2 — Cálculo de prioridad por fecha (Regla 1, T-1)

Como **Responsable del OMS**, quiero que el sistema decida automáticamente
cuándo preparar cada pedido según su fecha de entrega, para alistar en el
momento correcto (T-1). **Regla de la primera entrega.**

- **FR2.1** El Motor de Reglas usa la `fecha de expedición planificada` (fecha
  de entrega del cliente) como **insumo**; **no la modifica** y **no escribe
  ninguna fecha nueva** (no existe "fecha de alisto").
- **FR2.2** Regla T-1: un pedido debe prepararse su fecha de entrega − 1 día
  (ajustado por la duración de la ruta; en CR suele ser 1 día).
- **FR2.3** Horas de corte: si el pedido entra antes del corte de su ruta (CR:
  3 p.m. rural, 5 p.m. GAM — configurables), se lista para el día siguiente; si
  entra después, rueda al siguiente evento de esa ruta.
- **FR2.4** Cuando la regla se cumple para un pedido, el OMS cambia
  `estado = DISP` + `situación = GENERADA` y le asigna la prioridad del día
  (número invertido). Si no se cumple, no lo genera (no cambia la situación)
  hasta que corresponda.
- **FR2.5** Fallback: si la compañía no provee la fecha de entrega (caso Cofersa
  hoy), se aplica la regla de ruta (día de salida por ruta) para decidir el
  T-1 (ver OQ-3).

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

### FR6 — Las 5 macro-reglas

- **FR6.1 (Regla 1 — cálculo de fecha, T-1)**: ver FR2. **Primera entrega.**
- **FR6.2 (Regla 2 — análisis de observaciones)**: interpreta el texto libre de
  `observaciones` (dirección, fecha solicitada, urgencia, cita, cliente retira)
  con un modelo de IA. **Primera entrega** (su primer subconjunto = cliente
  retira). Ver FR7.
- **FR6.3 (Regla 3 — cliente retira)**: subconjunto de observaciones; identifica
  el "cliente retira" por patrón → asigna la prioridad más alta y lo agrupa en
  un viaje/cliente "dummy". **Primera entrega.**
- **FR6.4 (Regla 4 — asignación de viaje/bajada)**: **fuera de la primera
  entrega**. El OMS **no crea ni asigna el viaje** — eso es de
  **Planificación/TMS**. El OMS **consume** el viaje ya abierto y (a futuro)
  asigna la bajada/muelle. La asignación de la bajada se documenta como **futura**
  con esta nota de propiedad.
- **FR6.5 (Regla 5 — inventario/capacidad)**: **futuro**. Validar viabilidad de
  inventario/capacidad antes de liberar. No entra en el alcance actual.

### FR7 — Análisis de observaciones con IA (Amazon Bedrock)

- **FR7.1** La regla de observaciones (y su subconjunto cliente retira) se
  resuelve con un **modelo de IA nativo de Amazon Bedrock** (ultraligero),
  integrado con las Lambdas, que clasifica el texto libre y dispara acciones.
  (Nota: hoy **no está integrado** en el código; es requerimiento a construir.)
- **FR7.2** El **prompt vive en la Lambda** y **no es editable desde la UI**.
- **FR7.3** Una misma observación puede producir varias salidas; la **primera
  salida a implementar es cliente retira**, dejando el modelo preparado para
  otras (cambio de dirección, cita, etc.).
- **FR7.4** Costo objetivo: **< $1 USD/mes** para ~400 pedidos/día de Cofersa
  con texto ~40 caracteres (ver NFR2).
- **FR7.5** Ante fallo/timeout de Bedrock, el pedido se prioriza por las demás
  reglas (degrada sin bloquear el motor).

### FR8 — Escritura de estado/situación y prioridad en el WMS/EFLOW

Como sistema, el OMS deja el pedido "alistado" cambiando sus campos en EFLOW.

- **FR8.1** El OMS escribe en el registro del pedido en EFLOW: `estado = DISP`,
  `situación = GENERADA` y la **prioridad** calculada, en una **escritura
  atómica** (nunca `GENERADA` sin prioridad). **No escribe fechas.** La
  `fecha de expedición planificada` queda intacta.
- **FR8.2** El OMS **no** escribe en el WMH ni en las tablas intermedias; su
  escritura llega **solo** al nivel del WMS/EFLOW.
- **FR8.3** Tras dejar la situación en `GENERADA`, el pedido queda **alistado** y
  pasa a **Planificación** (handoff). El armado del viaje NO es del OMS.

> **Corrección de v2 mantenida**: se elimina por completo el antiguo
> requerimiento de "inserción al Lago de Datos". El OMS escribe a nivel WMS/EFLOW.

### FR9 — Simulador (configurador de simulaciones)

Como **Responsable del OMS**, quiero configurar, previsualizar y aplicar
simulaciones de priorización, manual o automáticamente.

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

- **C1 — Alcance WMS/EFLOW**: el OMS lee y escribe **solo** a nivel del
  WMS/EFLOW (estado/situación + prioridad). No toca el WMH ni las intermedias;
  termina en "alistado".
- **C2 — El OMS no arma el viaje**: el armado del viaje/ruta es de
  Planificación/TMS; el OMS deja el pedido alistado y hace el handoff.
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
