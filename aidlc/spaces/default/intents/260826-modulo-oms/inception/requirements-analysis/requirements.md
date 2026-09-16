# Requerimientos — Módulo OMS (Order Management System)

> Intent: `260826-modulo-oms`. Etapa: Requirements Analysis (Inception,
> re-corrida). Proyecto brownfield `sto_tms_olo`. Idioma: español.
>
> Esta versión **corrige y reemplaza** la anterior a la luz de las decisiones
> firmes registradas en `aidlc/spaces/default/memory/project.md` (`## Decided`)
> y de las reuniones funcionales y de diseño de 2026-09 (Antonio, Calzadilla,
> diseño de solución, simulador). Correcciones estructurales principales frente
> a la versión previa:
>
> 1. **Posicionamiento**: el OMS **lee del WMS/EFLOW, aplica reglas y escribe a
>    nivel del WMS** (cambia `estado`/`situación` y la prioridad de los
>    registros). **No** existe inserción a un "lago de datos", **no** toca el
>    WMH, **no** lee tablas intermedias. Termina en **"alistado"**.
> 2. **Prioridad**: **numérica e invertida** (menor número = mayor prioridad),
>    atada a la fecha (regla T-1), con **score ponderado desde la primera
>    entrega**. Se elimina el modelo de niveles nombrados (`priority_tier`
>    crítico/alto/medio/bajo).
> 3. El OMS **no calcula ni escribe fechas**; no existe "fecha de alisto".
> 4. Motor de Reglas = **catálogo semi-configurable** (no constructor dinámico).
> 5. **Simulador = configurador de simulaciones** (entidad persistida).
> 6. **Multi-compañía**: Lambda por compañía; la compañía es un **filtro/selector**
>    en la UI (no un perfil).

## Análisis de intención

El objetivo de negocio es **automatizar la priorización de alistamiento de
pedidos** que hoy realiza manualmente la Torre de Control (WMH) — reemplazándola
de forma **progresiva**. El OMS es un **intermediario** que se posiciona entre
los pedidos del WMS/EFLOW y su preparación: **lee** los pedidos, **aplica reglas
de negocio** para decidir cuáles se preparan y con qué prioridad, y **escribe de
vuelta en el WMS/EFLOW** cambiando el `estado`/`situación` del pedido (de `DISP`
a `situación = GENERADA`) y su **prioridad**. Con eso, el WMS genera
automáticamente las tareas de picking.

Lo que el OMS **busca lograr**:

- Sustituir los "clicks" manuales de la Torre de Control por un motor de reglas
  auditable, para no depender de que un operador lea ~400–500 observaciones/día.
- Decidir **cuándo** preparar cada pedido (regla de fecha T-1) y con qué
  **prioridad** (número invertido), evitando el alistamiento prematuro (satura
  el muelle) y el tardío (pierde el viaje).
- Operar **multi-compañía y multi-país** (Cofersa, EPA… en CR/VE) con reglas
  específicas por compañía.

**Alcance del OMS** (firme, act. 2026-09-14): el OMS **lee** los pedidos del
WMS/EFLOW, aplica las reglas y **cambia ciertos campos de esos registros a nivel
del WMS** (`estado`/`situación` + prioridad). **Hasta ahí llega.** El WMS/EFLOW
genera las tareas de picking cuando la situación queda en `GENERADA`.

**Fuera de alcance** (de otros módulos o a futuro): creación/asignación del
**viaje** (Planificación/TMS), picking y guía de carga (WMS/TMS), ruteo de
entrega, facturación/despacho (TMS, por compañía), validación de inventario por
línea, y el rediseño completo del flujo (pedido → TMS → OMS → WMS) que queda a
futuro. El OMS **no** modifica el WMH ni lee las tablas intermedias.

### Actores (roles del OMS, de la Adenda del 2026-08-26)

| Rol | Responsabilidad en el OMS |
|---|---|
| **Operador de Despacho** | Mantiene el CRUD del calendario de rutas y días de despacho en el OMS (cuya **fuente de verdad es el TMS**; el OMS lo consume). |
| **Administrador de Módulo** | Configura el **catálogo de reglas** (activar/desactivar, peso/score, parámetros) por compañía; superusuario del módulo (no del TMS completo). |
| **Jefe de Almacén** | Visibilidad y reportería del módulo; acceso a la planificación. **No bloquea ni aprueba** el flujo. |
| **Responsable del OMS** | Monitorea el motor automatizado; ejerce el **override manual** (única intervención humana sobre el cálculo) y decide aplicar simulaciones. |

> El cálculo de prioridad es **100 % automático**; **no existe** paso de
> aprobación humana antes del alistamiento (Adenda 2026-08-26). La única
> intervención humana es el **override manual** por un rol autorizado.

## Glosario

- **OMS**: módulo que lee pedidos del WMS/EFLOW, calcula prioridad y cambia su
  `estado`/`situación` para dejarlos "alistados" (listos para picking).
- **WMS / EFLOW**: sistema de gestión de almacén; genera las tareas de picking
  cuando la situación pasa a `GENERADA`. Fuente de los pedidos.
- **WMH (Torre de Control)**: sistema actual a reemplazar progresivamente. El
  OMS **no** lo modifica.
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
- **compañía**: entidad de negocio (Cofersa `0109`, EPA…) con reglas propias
  (Lambda por compañía). El **país** se maneja dentro del código de compañía
  (p. ej. `EPA GT`, `EPA VE`).
- **Capa X**: capa de integración/maestros; todas las tablas llevan `compañía` y
  `país`.

## Requerimientos funcionales

### FR1 — Lectura de la cola de priorización desde el WMS/EFLOW

Como sistema, el OMS obtiene de EFLOW los pedidos candidatos a priorizar.

- **FR1.1** La cola se resuelve sobre `expedición_cabecera`: pedidos con
  `fecha_de_cierre IS NULL` y `estado`/`situación` = `DISP` (y sin
  `NUMEROVIAJEWMH`, es decir sin viaje asignado). Equivale al anti-join con
  `almacén_movimiento_carcam` (los no procesados).
- **FR1.2** Para progreso/detalle, el OMS puede cruzar con `expedición_detalle`
  y `almacén_movimiento_carcam` por `pedido + almacén + compañía + sucursal`.
- **FR1.3** `Journey_Orders` es **opcional** (solo para ver a qué viaje está
  asignado un pedido); no interviene en decidir la prioridad.
- **FR1.4** El OMS lee sobre la **réplica** de `EFLOW_OLO`, no contra el
  transaccional. (Dependencia externa: la réplica **aún no existe**, ver OQ-2.)

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

### FR4 — Override manual de prioridad

Como **Responsable del OMS** (rol autorizado), quiero alterar la prioridad de un
pedido puntual, para casos extraordinarios (camión accidentado, urgencia).

- **FR4.1** Un rol autorizado puede cambiar la prioridad de un pedido; exige un
  **motivo obligatorio** y queda registrado en la Auditoría como cambio
  **manual**.
- **FR4.2** El override es la **única** intervención humana sobre el cálculo; no
  hay aprobación de lote.
- **FR4.3** Un usuario sin permiso de override no puede alterar la prioridad
  (acción denegada).

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
- **FR5.3** El catálogo se ve **por compañía**: un selector de compañía cambia la
  lista de reglas (cada compañía tiene su Lambda con reglas específicas).
- **FR5.4** La lógica de cada regla y, cuando aplica, su **prompt de IA**, viven
  en la Lambda (código); **no** son editables desde la UI.

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
  asigna la bajada/muelle; todo lo del mismo viaje va a la misma bajada. La
  asignación de la bajada se documenta como **futura** con esta nota de
  propiedad.
- **FR6.5 (Regla 5 — inventario/capacidad)**: **futuro**. Validar viabilidad de
  inventario/capacidad antes de liberar (reservas, reposiciones, callbacks al
  ERP). No entra en el alcance actual.

### FR7 — Análisis de observaciones con IA (Amazon Bedrock)

- **FR7.1** La regla de observaciones (y su subconjunto cliente retira) se
  resuelve con un **modelo de IA nativo de Amazon Bedrock** (ultraligero),
  integrado con las Lambdas, que clasifica el texto libre y dispara acciones.
- **FR7.2** El **prompt vive en la Lambda** y **no es editable desde la UI**.
- **FR7.3** Una misma observación puede producir varias salidas; la **primera
  salida a implementar es cliente retira**, dejando el modelo preparado para
  otras (cambio de dirección, cita, etc.).
- **FR7.4** Costo objetivo: **< $1 USD/mes** para ~400 pedidos/día de Cofersa
  con texto ~40 caracteres (ver NFR2).

### FR8 — Escritura de estado/situación y prioridad en el WMS/EFLOW

Como sistema, el OMS deja el pedido "alistado" cambiando sus campos en EFLOW.

- **FR8.1** El OMS escribe en el registro del pedido en EFLOW: `estado = DISP`,
  `situación = GENERADA` y la **prioridad** calculada. **No escribe fechas.** La
  `fecha de expedición planificada` queda intacta (el cliente factura con ella);
  la `fecha de generación` de EPRAC cambia sola al generar.
- **FR8.2** El OMS **no** escribe en el WMH ni en las tablas intermedias; su
  escritura llega **solo** al nivel del WMS/EFLOW.
- **FR8.3** Tras dejar la situación en `GENERADA`, el WMS genera las tareas de
  picking; a partir de ahí el pedido sale del alcance del OMS ("alistado").

> **Corrección aplicada**: se elimina por completo el antiguo requerimiento de
> "inserción de pedidos priorizados al Lago de Datos". Ese modelo no aplica: el
> OMS escribe a nivel del WMS/EFLOW.

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
  las columnas / selección de columnas), no como un recuadro de "estado actual".
- **FR9.4** La **Simulación es una entidad persistida** (bitácora): fecha, autor
  (usuario o automático), reglas usadas, filtro aplicado, estado
  (`simulada`/`aplicada`), compañía. Pueden existir varias `simuladas`, pero
  **solo una `aplicada` por compañía** (la última, o la que el usuario elija).
- **FR9.5** Aplicación **manual / automática / mixta**: manual = el usuario
  revisa y pulsa "Aplicar"; automática = se genera y aplica sola; mixta = se
  genera automáticamente con **ventana de revisión** y **hora de corte** (si
  nadie interviene antes, se aplica sola).
- **FR9.6** Configuración por compañía: número de simulaciones/día,
  frecuencia/horarios, filtro de situación por simulación y modo de aplicación
  por simulación.

### FR10 — Cola de Priorización (pantalla operativa)

- **FR10.1** La Cola entra por defecto filtrada en `situación = DISP` (+
  `fecha_de_cierre IS NULL`); el usuario puede cambiar a otras situaciones.
- **FR10.2** Se **mantiene el filtro de almacén** (una compañía puede tener
  varios almacenes) y se ofrece un **selector/filtro de compañía** dentro de la
  vista (no por perfil).
- **FR10.3** Se muestra el **nombre** de la compañía (resuelto contra el maestro,
  no el código crudo).
- **FR10.4** El usuario puede **elegir qué columnas** ve; la preferencia se
  guarda en una tabla `User Preference` (campo JSON).
- **FR10.5** El **detalle del pedido** se muestra en un **modal** (no panel
  lateral), para que la tabla use todo el ancho (el WMS trae muchas columnas).
- **FR10.6** Desde el detalle, un rol autorizado puede ejecutar el **override
  manual** (FR4).

### FR11 — Panel OMS y Auditoría

- **FR11.1** El Panel muestra la salud del motor e indicadores operativos.
- **FR11.2** El indicador **% de override manual** usa una **ventana temporal
  configurable** (24 h / 12 h / semana), no fija. Los datos de métricas se
  retienen ~3–5 meses.
- **FR11.3** La **Auditoría** registra las priorizaciones ejecutadas
  distinguiendo **automático vs. manual** (usuario y motivo en el caso manual);
  es de solo lectura.

### FR12 — Calendario de rutas y días de despacho

- **FR12.1** El OMS ofrece el **CRUD** del calendario de rutas y días de
  despacho (gated al rol administrador), pero su **fuente de verdad es el TMS**
  (módulo de rutas); el OMS lo **consume**.
- **FR12.2** El calendario es **por cliente/compañía** y responde a acuerdos
  Olo↔cliente (con implicación tarifaria). Soporta calendarios independientes
  por país.

### FR13 — Multi-compañía y multi-país

- **FR13.1** Las reglas son específicas por compañía → **una Lambda por
  compañía**; la regla identifica su compañía. No se parametrizan en código.
- **FR13.2** En la UI, la compañía es un **filtro/selector dentro de la vista**
  (un mismo perfil ve varias compañías); **no** hay silo por perfil de compañía.
- **FR13.3** El **país** se maneja dentro del código de compañía (p. ej.
  `EPA GT`, `EPA VE`), evitando un filtro de país aparte.
- **FR13.4** **Todas** las tablas del OMS llevan `compañía` y `país` como
  columnas (estándar Capa X). El nombre de la compañía se resuelve con un
  **maestro** (no consultando EFLOW en cada lectura).

### FR14 — Seguridad y control de acceso

- **FR14.1** El OMS diferencia al menos tres niveles de acceso: visualización,
  operación (override, consulta de auditoría) y administración (catálogo de
  reglas, calendario, configuración de simulaciones).
- **FR14.2** Delega autenticación y tokens a la capa de seguridad transversal
  del TMS; resuelve la autorización validando el token contra la acción.
- **FR14.3** Toda acción de escritura registra el identificador del usuario en
  la Auditoría.

## Requerimientos no funcionales

> Umbrales **provisionales**, a validar con volumen real.

- **NFR1 — Frecuencia del motor**: el motor de reglas corre **al menos una vez
  al día** (primera hora) y en las **horas de corte**, revisitando prioridades
  (lo no alcanzado hoy sube de prioridad mañana).
- **NFR2 — Costo de IA**: el análisis de observaciones con Bedrock cuesta
  **< $1 USD/mes** para ~400 pedidos/día (texto ~40 caracteres).
- **NFR3 — Volumen**: referencia ~**400–500 pedidos/día** (Cofersa).
- **NFR4 — Capacidad operativa**: ~**80 pedidos** en proceso simultáneo (límite
  de personal); los demás esperan en cola aunque tengan prioridad.
- **NFR5 — Aislamiento multi-compañía/país**: ninguna operación de una compañía/
  país lee ni escribe datos de otra; se garantiza por las columnas
  `compañía`/`país` y la Lambda por compañía.
- **NFR6 — Auditabilidad**: los registros de auditoría son de solo lectura;
  retención de métricas ~3–5 meses.
- **NFR7 — No modificación de fechas**: el OMS nunca escribe fechas en EFLOW
  (invariante verificable: la `fecha de expedición planificada` queda intacta).
- **NFR8 — Consistencia de UI**: las pantallas del OMS se componen con el design
  system existente (React), sin introducir kits de UI nuevos.
- **NFR9 — Lectura sobre réplica**: las consultas van contra la réplica de
  `EFLOW_OLO`, no contra el transaccional (depende de OQ-2).

## Restricciones

- **C1 — Alcance WMS/EFLOW**: el OMS lee y escribe **solo** a nivel del
  WMS/EFLOW (estado/situación + prioridad). No toca el WMH ni las intermedias;
  termina en "alistado".
- **C2 — El OMS no crea el viaje**: la creación/asignación del viaje es de
  Planificación/TMS; el OMS consume el viaje ya abierto.
- **C3 — El OMS no escribe fechas**: usa la fecha de entrega como insumo.
- **C4 — Stack oficial Intelix**: AWS (serverless), **Python + Lambdas**
  (backend), **React** (frontend), **PostgreSQL**, arquitectura por eventos,
  plantillas SAM. Solo Intelix despliega. El prototipo actual sobre Supabase
  (Readdy) **no** es el target.
- **C5 — BD `logistica_olo`**: una sola base de datos con **esquemas por módulo**
  (`OMS`, `TMS`); la multi-compañía se resuelve con `compañía`/`país` como
  **columnas**, no esquema por compañía. (El enfoque de BD sigue no-oficial, ver
  OQ-1.)
- **C6 — Reglas en código**: la lógica de las reglas (y los prompts de IA) vive
  en Lambdas, no se arma desde la UI.
- **C7 — Capa X**: todas las tablas llevan `compañía` y `país`; maestro de
  compañías en Capa X.

## Supuestos

- **A1** La Torre de Control (WMH) se mantiene en paralelo durante la transición;
  el fin último es reemplazarla, de forma progresiva.
- **A2** El pedido llega en `estado = DISP` / `situación = DISP` al WMS; el OMS
  lo activa cambiando la situación a `GENERADA`.
- **A3** El motor puede regenerar/revisitar prioridades en cualquier estatus
  salvo cuando el pedido ya está al 100%.
- **A4** Los umbrales de NFR son provisionales hasta conocer el volumen real.

## Fuera de alcance

- Inserción a un "lago de datos" (**eliminado**; el OMS escribe a nivel WMS).
- Creación/asignación del viaje (Planificación/TMS).
- Picking, guía de carga, ruteo de entrega (WMS/TMS).
- Facturación/despacho (TMS, reglas por compañía).
- Regla 5 (inventario/capacidad) y priorización por línea de pedido — futuro.
- Rediseño del flujo completo pedido → TMS → OMS → WMS — futuro.
- Aprobación humana de la propuesta de priorización — no existe.

## Open Questions

- **OQ-1 — Base de datos**: `logistica_olo` con esquemas `OMS`/`TMS` y
  `compañía`/`país` como columnas es la dirección actual, pero **no es oficial**;
  cerrar con arquitectura/Calzadilla.
- **OQ-2 — Réplica de `EFLOW_OLO`**: **no existe** hoy; hay que solicitarla (vía
  Alfredo), definiendo tablas (`expedición_cabecera`, `almacén_movimiento_carcam`,
  `expedición_detalle`, `Journey_Orders`, usuarios). Bloqueante para leer sin
  pegar al transaccional.
- **OQ-3 — Fecha de entrega de Cofersa**: hoy Cofersa **no** envía la fecha de
  entrega (la llena por default con la creación). Sin ella, la Regla 1 usa el
  fallback por ruta. Asegurar que la envíe en `fecha de expedición planificada`.
- **OQ-4 — Tabla de prioridades del cliente**: los números 1..N que define el
  cliente están pendientes de entrega (insumo para cuando desaparezca el WMH).
- **OQ-5 — Score vs. filtro estricto y umbral de inyección**: el modelo de
  **score** ya está decidido; queda por cerrar con el cliente si alguna regla es
  **obligatoria** (filtro) además de sumar peso, y a partir de qué prioridad se
  inyecta.
- **OQ-6 — Duración de rutas y horas de corte**: las define el equipo de
  transporte (Ricardo en CR; equipo de VE); hay que crear la regla de cortes.
- **OQ-7 — Nomenclatura del viaje de cliente retira**: cómo el TMS genera el
  viaje/ruta 0 de cliente retira y su identificador (con Andrey/TMS).

## Sources

- `aidlc/spaces/default/memory/project.md` (`## Decided`, `## Corrections`) —
  las ~20 decisiones firmes que rigen esta corrección (alcance WMS/EFLOW,
  prioridad numérica T-1 + score, 5 macro-reglas, motor catálogo, multi-compañía,
  fuente de datos, Capa X, stack).
- `documents/2026-09-08-reunion-funcional-oms-reglas-priorizacion-antonio.md` —
  5 macro-reglas, T-1, horas de corte, cliente retira, viaje/bajada, flujo de
  estados DISP→GENERADA, prioridad numérica invertida, primera entrega = 2 reglas.
- `documents/2026-09-14-reunion-calzadilla-cruce-tablas-prioridad.md` — fuente de
  la cola (`expedición_cabecera` con `fecha_de_cierre IS NULL` + `DISP`;
  anti-join con `almacén_movimiento_carcam`; `Journey_Orders` opcional;
  `NUMEROVIAJEWMH`).
- `documents/2026-09-14-reunion-diseno-solucion-oms-mockup-ia-datos.md` — IA de
  Bedrock para observaciones/cliente retira, multi-compañía (Lambda por compañía,
  selector no perfil), Capa X, réplica inexistente, Cola (default DISP, columnas
  por usuario, nombre de compañía).
- `documents/2026-09-15-reunion-simulador-oms-configurador-y-bd.md` — Simulador =
  configurador de simulaciones (entidad persistida, modal previo, manual/
  automática/mixta, una aplicada por compañía); BD `logistica_olo` con esquemas
  `OMS`/`TMS`.
- `documents/2026-08-26-reunion-oms-roles.md` (Adenda) — 4 roles; cálculo 100 %
  automático sin aprobación; override manual como única intervención humana.
- `aidlc/spaces/default/codekb/sto_tms_olo/business-overview.md`,
  `architecture.md`, `code-structure.md` — dominio TMS, posicionamiento y design
  system existente.
- `aidlc/spaces/default/intents/260826-modulo-oms/inception/requirements-analysis/requirements-analysis-questions.md`
  — decisiones de esta re-corrida (Q1–Q5 = A) y sus precisiones.

## Assumptions & Open Questions

Ver **Supuestos** (A1–A4) y **Open Questions** (OQ-1 a OQ-7) arriba. En síntesis,
lo que queda abierto depende de datos/arquitectura/cliente (BD, réplica, fecha de
Cofersa, tabla de prioridades, score-vs-filtro, cortes, viaje de cliente retira)
y no bloquea la aprobación de estos requerimientos; se cierra antes o durante el
diseño de dominio e infraestructura.
