# Requerimientos — Módulo de Planificación

Proyecto **brownfield** `sto_tms_olo` (TMS OLO). Idioma: español. **Fecha de corte: 2026-11-05.**
Responsable del módulo: Jesús Araujo (Intelix). Versión para la **ficha del proyecto**. Los cambios
posteriores a esta fecha se manejan como **gestión de cambios** (indicación de la líder de proyecto).

El documento describe el módulo **tal como está desplegado hoy** (sandbox AWS, Aurora `tms_olo`) y lo
que quedó decidido en las reuniones hasta el 2026-11-05. Reemplaza la versión del 2026-10-21, que
describía el flujo manual anterior (generar, editar y confirmar el plan a mano, sobre el backend
hexagonal `TMS-Backend`). Ese flujo se retiró.

Las historias de usuario, con sus criterios de aceptación y escenarios de prueba, están en
[historias-de-usuario-planificacion.md](../../stories/planificacion/historias-de-usuario-planificacion.md).

**Qué cambió respecto de la versión anterior:**

- **La planificación es automática.** Ya no hay un botón "Generar plan" ni planes `draft` que haya que
  confirmar. El planificador arma los viajes solo, cada hora, y el usuario consulta el resultado
  (reunión con Carlos del 2026-10-10: "planificar primero, priorizar después"; Planificación es el Paso 2).
- **Los pedidos vienen de eFlow.** Se ingestan desde eFlow (pedidos DISP/DISP) a `tbl_orders` en Aurora.
- **El número de viaje lo genera el TMS** y se escribe a eFlow, hoy de forma simulada en
  `sim_expedicionescabecera`.
- **Se agregaron:** la Bandeja de pedidos (con devoluciones), el cambio de fecha de entrega, el
  replan programado, los viajes directos por tienda para EPA, las recolectas, el handoff al OMS por
  columnas y el estándar de nombres de base de datos (`tbl_*`).
- **"Implementado"** significa desplegado en el sandbox y verificado contra Aurora, salvo que se diga otra cosa.

## Análisis de intención

**Objetivo de negocio:** automatizar el armado de los viajes de reparto. A partir de los pedidos que
eFlow deja disponibles (DISP/DISP), el sistema decide qué pedidos van en qué camión, en qué orden se
entregan y cuándo tiene que salir cada viaje. Después le entrega ese resultado al OMS, que prioriza y
libera los pedidos a eFlow para el alistamiento.

**Lugar en el flujo** (decisión del 2026-10-10, refinada el 2026-10-15/19):

1. eFlow (WMS) tiene el pedido en DISP/DISP.
2. **Planificación** lo ingesta, arma el viaje, calcula la fecha de salida y escribe el número de viaje.
3. El **OMS** prioriza y, un día antes de la salida, libera el pedido a eFlow (situación `GENE`).
4. eFlow genera el picking.
5. **Tracking** ejecuta el viaje.

**Metas:**

- Que ningún camión salga sobrecargado: techo de 85 % de peso (Decreto 31363-MOPT) y 95 % de volumen,
  con un máximo de 16 paradas.
- Que el plan siempre esté al día con la cola de eFlow, sin intervención manual (replan cada hora).
- Respetar las reglas de cada cliente:
  - **Cofersa (mayoreo):** consolida varios clientes por zona.
  - **EPA (tiendas):** viaje directo, con el camión lleno, a una sola tienda.
  - **Cliente retira:** no lleva camión.
- Aprovechar los viajes existentes para recoger las devoluciones.
- Que el OMS tenga una sola fuente de verdad (`tbl_orders`) para priorizar y liberar.

**Alcance:**

- Ingesta de pedidos desde eFlow.
- Bandeja de pedidos (entregas y devoluciones).
- Cambio de fecha de entrega.
- Armado automático de viajes (capacidad, agrupación, secuencia, fecha de salida, número de viaje).
- Recolectas.
- Handoff al OMS.
- Vistas de consulta: Calendario y Planificaciones.

**Trabajo transversal del TMS que hizo este equipo:**
- el login con Google (FR10);
- el estándar de base de datos OLTP Intelix, con el renombrado de toda la base `tms_olo` (FR11).

**Fuera de alcance:**

- Priorizar o liberar pedidos a eFlow (es del OMS).
- Ejecutar o trackear el viaje (Tracking y la app móvil).
- Tarifas y liquidación (Tarifas).
- Crear devoluciones (módulo de Devoluciones y app).

## Actores

| Rol | Responsabilidad en Planificación |
|---|---|
| **Planificador / Coordinador de transporte** | Consulta la Bandeja y los viajes armados (Calendario, Planificaciones). Puede forzar un replan. Necesita el permiso `planificacion:view`; para forzar el armado, `planificacion:edit`. |
| **Administrador** (roles `SuperAdministrador`, `SuperUsuario`, `Administrador`, `Admin`) | Además de lo anterior, **cambia la fecha de entrega** de un pedido desde la Bandeja. La reunión del 2026-11-03 pedía la aprobación de un Coordinador con clave master; se decidió que lo haga **solo un admin**. |
| **Servicio al cliente** | Crea las devoluciones que Planificación agenda como recolectas (su pantalla está en el módulo de Devoluciones). |
| **Sistema (replan programado)** | Ingesta eFlow y rearma los viajes cada hora. Firma los planes con `REPLAN_APP_USER_ID` o, si no está, con el usuario activo más antiguo de la organización. |
| **OMS** (módulo vecino) | Lee de `tbl_orders` lo que Planificación estampó, prioriza y libera. No modifica las columnas de Planificación. |
| **Chofer** (Tracking/app) | Ejecuta el viaje. Al iniciarlo, las paradas de Planificación se convierten en guías de despacho. |

## Glosario

- **DISP/DISP:** pedido de eFlow con estado `TPEXES = DISP` y situación `TPEXSI = DISP`, sin cierre
  (`FECHACIERRE` nulo) y sin viaje (`NUMEROVIAJEWMH` nulo). Es la cola que Planificación toma.
- **Compañía:** cliente de OLO en eFlow (`IDCOMPANIA`): Cofersa `0109`, EPA `0029`. En Aurora es `tbl_customers`.
- **Cliente destino:** a quien se le entrega (`IDCLIENTE` de eFlow, `tbl_final_customers`). Su tipo es
  `TIENDA` (las tiendas de EPA, códigos `001`–`008`) o `MAYOREO`. El código solo es único dentro de su
  compañía: el `008` existe en EPA y en Cofersa.
- **Zona:** la `RUTA` de eFlow (`delivery_zone`). Es el grupo de consolidación del mayoreo. Si no
  viene, el pedido queda en la zona "S/R".
- **Plan (`tbl_route_plans`):** los viajes de **un día y una compañía** en un almacén. Se crea en estado `confirmed`.
- **Viaje (`tbl_plan_trips`):** un camión (de la flota propia) con sus paradas. Su grupo
  (`delivery_zone`) es la zona, la tienda (EPA) o `RETIRA`.
- **Parada (`tbl_plan_stops`):** una **entrega** (`stop_type = delivery`, un pedido) o una **recolecta**
  (`stop_type = collection`, una devolución que apunta a su pedido original).
- **Número de viaje:** `YYYYMMDD-CCCC-NNN`, es decir, fecha de entrega, código de compañía y
  secuencia (por ejemplo `20261106-0029-001`). En eFlow va sin guiones (`NUMEROVIAJEWMH`, bigint).
- **Lead time / T-n:** días de tránsito del viaje. Hoy vale `1 + floor(km / 70)` en línea recta desde
  el depósito CR hasta la parada más lejana, con un piso de 1 día.
- **Fecha de salida (`dispatch_date`):** fecha de entrega menos el lead time. Es la misma para todo el viaje.
- **Viaje liberado / congelado:** viaje con al menos una entrega ya liberada por el OMS
  (`oms_processed_at`). El replan no lo toca.
- **Cliente retira:** el cliente recoge en el almacén. Se detecta por texto en `OBSERVACIONESEXPEDICION`
  ("RETIRA", "RETIRAN", "RECOGE", "PASA A RETIRAR", …) y va a un grupo `RETIRA` sin camión.
- **Recolecta:** pasar a buscar una devolución (`tbl_returns`, estado `pending` o `approved`) en un
  viaje que ya va a ese cliente o a esa zona.
- **Espejo de eFlow (`sim_expedicionescabecera`):** copia en Aurora de `EXPEDICIONESCABECERA`. Hace de
  destino del write-back mientras no estén las APIs de EPRAC.
- **EPRAC:** el sistema o equipo que expone las APIs sobre eFlow.

## Requerimientos funcionales

### FR1 — Ingestar los pedidos disponibles de eFlow

Como sistema, quiero traer de eFlow los pedidos disponibles para planificarlos sobre Aurora.

- FR1.1 La ingesta lee de eFlow CR (solo lectura) los pedidos en DISP/DISP, sin cierre, sin viaje y
  con fecha de entrega de hoy en adelante.
- FR1.2 Los guarda en `tbl_orders` con un UPSERT idempotente por la llave de eFlow
  (almacén, compañía, sucursal, expedición). Re-ingestar no duplica: actualiza estado, situación, fecha,
  peso, volumen, observaciones y cliente destino.
- FR1.3 Resuelve compañía, cliente destino (por **compañía + código**) y sucursal. Un pedido al que le
  falta alguno de los tres no se ingesta y queda reportado en `faltantes`.
- FR1.4 Trae las líneas del pedido a `tbl_order_items` y sincroniza el espejo `sim_expedicionescabecera`.
- FR1.5 Marca `es_cliente_retira` cuando las observaciones lo indican.
- FR1.6 Si un administrador cambió la fecha de entrega (FR3), la ingesta **no la pisa**. La fecha que
  manda eFlow se guarda aparte, en `delivery_date_eflow`.

**Acceptance (BDD):** Dado un pedido DISP/DISP de EPA para la tienda `008`, When corre la ingesta,
Then queda en `tbl_orders` amarrado al cliente destino `T008 CARTAGO` **de EPA** (tipo `TIENDA`) y no
al `008` de Cofersa.

**Estado: Implementado.** Fuente: `backend/planning/src/ingest_orders.py`, `ingest_items.py`,
`sim_eflow_sync.py`, `cliente_retira.py`.

### FR2 — Bandeja de pedidos

Como planificador, quiero ver en una bandeja los pedidos y las devoluciones que hay que atender.

- FR2.1 La bandeja une:
  - las **entregas**: pedidos DISP/DISP de eFlow ya guardados en Aurora;
  - las **recolectas**: devoluciones abiertas (`pending` o `approved`), creadas en el TMS o en la app.
- FR2.2 Cada fila muestra el tipo, con una etiqueta "Devolución" en las recolectas. Hay un filtro de
  **Tipo**: Delivery o Pickup.
- FR2.3 La recolecta usa los datos de su pedido original (cliente, zona). Su fecha es la de recolección
  agendada (FR8) o, si todavía no tiene, la fecha en que se creó.
- FR2.4 El detalle del pedido se abre en un modal.
- FR2.5 El alcance (almacén y compañía) sale del contexto operativo del encabezado.

**Acceptance (BDD):** Dada una devolución `pending` y otra `completed`, When se abre la bandeja, Then
aparece solo la `pending`, como Pickup y con la etiqueta "Devolución".

**Estado: Implementado.** Fuente: `backend/planning/src/bandeja.py`, `src/pages/oms/bandeja/*`.
**Abierto (OQ-1):** hoy la bandeja también muestra los pedidos que ya tienen viaje pero que el OMS
todavía no liberó (12 de 100 al 2026-11-05).

### FR3 — Cambiar la fecha de entrega

Como administrador, quiero cambiar la fecha de entrega de un pedido cuando el cliente lo pide, y que
quede registrado.

- FR3.1 `POST /api/v1/planificacion/pedidos/{id}/fecha-entrega`. Solo un **admin**; los demás reciben 403.
- FR3.2 Se rechaza si el pedido **ya fue liberado** a eFlow (409) o si la fecha está en el pasado (400).
- FR3.3 Se registra quién y cuándo lo cambió (`delivery_date_changed_by` y `_at`), se suma 1 al contador
  `delivery_date_change_count` (es el que lee el Panel del OMS) y se guarda la fecha original de eFlow.
- FR3.4 Se rearman los dos días afectados, el viejo y el nuevo, para que el pedido cambie de viaje.

**Acceptance (BDD):** Dado un pedido EPA del 06-nov sin liberar, When un admin lo pasa al 05-nov, Then
el pedido sale del viaje del 06, entra en uno del 05, `delivery_date_eflow` queda en 06-nov, el
contador en 1 y el autor es ese admin.

**Estado: Implementado.** Fuente: `backend/planning/src/cambio_fecha.py`, `sql/57`, `sql/58`.
**Pendiente:** la fecha cambiada vive solo en el TMS; no se escribe de vuelta a eFlow.

### FR4 — Armar los viajes automáticamente

Como sistema, quiero armar los viajes de cada día y compañía sin intervención, respetando la capacidad
de la flota.

- FR4.1 Se planifica por **día y compañía** sobre los pedidos DISP/DISP de ese día que no estén en un
  viaje congelado.
- FR4.2 **Agrupación:**
  - **mayoreo** por **zona** (sin zona va a "S/R");
  - **tiendas (`TIENDA`, EPA)** por **tienda**, en viaje directo (reunión 2026-11-03);
  - **cliente retira** en un grupo `RETIRA` **sin camión ni capacidad**.
- FR4.3 **Capacidad:** dentro de cada grupo se llena un camión de la **flota propia activa**
  (`carrier_id` nulo, ordenada de mayor a menor capacidad) hasta el 85 % del peso, el 95 % del volumen y
  **16 paradas**. Lo que sobra va al siguiente camión. Los camiones rotan en el día para no repetirse.
  Un pedido que solo ya excede la capacidad va igual en su propio viaje.
- FR4.4 **Secuencia:** las paradas se ordenan por vecino más cercano desde el depósito CR. Los pedidos
  del mismo punto quedan juntos y los que no tienen coordenadas van al final.
- FR4.5 Si no hay flota propia activa y hay pedidos que planificar, la respuesta es 409.

**Acceptance (BDD):** Dados 3 pedidos EPA para T005, T006 y T008 el mismo día, When se arma el plan,
Then salen **3 viajes**, uno por tienda; y dados 20 pedidos de Cofersa de la zona 13, Then salen 2
viajes (16 + 4).

**Estado: Implementado.** Fuente: `backend/planning/src/plan_builder.py`, `ruta_geo.py`.

### FR5 — Fecha de salida y número de viaje

Como OMS y como eFlow, necesito saber cuándo sale cada viaje y con qué número.

- FR5.1 `lead_time_days` del viaje es `1 + floor(km_max / 70)`, con un piso de 1 si nadie tiene
  coordenadas. Nunca es nulo.
- FR5.2 `dispatch_date = delivery_date − lead_time_days`, igual para todos los pedidos del viaje.
- FR5.3 El número de viaje es `YYYYMMDD-CCCC-NNN`. Incluye la compañía para que Cofersa y EPA no repitan
  número el mismo día. Si la compañía no tiene código, va `0000`.
- FR5.4 El número sin guiones se escribe en `NUMEROVIAJEWMH` del espejo de eFlow. Es un UPDATE de la
  fila ya espejada; nunca crea filas.

**Acceptance (BDD):** Dado un viaje EPA del 06-nov, When se arma, Then su número es `20261106-0029-001`
y en el espejo `NUMEROVIAJEWMH = 202611060029001`.

**Estado: Implementado** (write-back simulado). **Pendiente:** el número de viaje real en eFlow espera la API de EPRAC.

### FR6 — Replan programado y viajes congelados

Como sistema, quiero que el plan se mantenga al día con eFlow sin que nadie lo dispare, sin romper lo
que el OMS ya liberó.

- FR6.1 Un EventBridge Scheduler (`dev-tms-planning-replan-horario`, `cron(0 5-16 ? * MON-FRI *)`, hora
  de Costa Rica) corre **cada hora en punto de 05:00 a 16:00, de lunes a viernes**. Primero ingesta eFlow
  y después replanifica cada almacén con cola.
- FR6.2 La ventana del replan es **(hoy, hoy + 3 días]**. Un día con viajes ya despachados
  (`completed`/`cancelled`) no se vuelve a armar.
- FR6.3 Al rearmar un día:
  - se borran solo los viajes **no liberados**, y sus pedidos quedan sin marca de planificación;
  - los liberados se conservan (**congelados**);
  - la numeración sigue después del último número usado.
- FR6.4 El replan también se puede forzar a mano (`POST /api/v1/planificacion/planes/replanificar`,
  permiso `planificacion:edit`).

**Acceptance (BDD):** Dado un viaje con un pedido ya liberado y otro pedido que salió de él, When corre
el replan, Then el viaje liberado queda intacto y el pedido suelto va a un viaje nuevo con el número
siguiente.

**Estado: Implementado.** Fuente: `replan.py`, `viajes_liberados.py`, `template.yaml` (`ReplanHorario`).

### FR7 — Handoff al OMS por columnas

Como OMS, quiero leer en `tbl_orders` el resultado del plan para priorizar y liberar.

- FR7.1 Planificación estampa en el pedido `numero_viaje`, `lead_time_days`, `dispatch_date` y
  `planning_run_id`. Las columnas del OMS (`priority`, `oms_score`, `wms_situation`,
  `oms_processed_at`, `prioritization_run_id`) **no se tocan**.
- FR7.2 La cola del OMS es `planning_run_id IS NOT NULL AND oms_processed_at IS NULL`.
- FR7.3 Un pedido que se cae del plan al rearmar vuelve a quedar en NULL en las columnas de
  Planificación, salvo que ya esté liberado.

**Estado: Implementado.** Verificado de punta a punta con el barrido del OMS (2026-11-04/05).

### FR8 — Agendar recolectas en los viajes

Como servicio al cliente, quiero que la devolución que registré se recoja en un viaje que ya pase por
ese cliente, sin armar un viaje aparte.

- FR8.1 En cada armado de un día, cada devolución abierta (`pending`/`approved`) de esa compañía que no
  esté agendada para otro día entra como parada `collection`:
  - en el viaje con camión que **ya entrega a ese mismo cliente**;
  - si no hay, en uno de **su grupo** (zona, o tienda si es EPA).
- FR8.2 Sirven los viajes ya liberados, porque la recolecta no va a eFlow. No se usa el grupo `RETIRA`.
- FR8.3 La parada queda **después de las entregas a ese cliente**; si no tiene entregas, al final. La
  devolución queda con `pickup_date` igual al día.
- FR8.4 Si ningún viaje del día pasa por ahí, la devolución queda sin agendar y se reintenta en el
  siguiente armado.
- FR8.5 La recolecta **no suma peso ni volumen** (v1: son de 1 a 3 artículos).
- FR8.6 Al iniciar el viaje, la guía nace con `stop_type = collection` y la devolución queda amarrada a
  su guía (`tbl_returns.dispatch_guide_id`). La app la muestra como recolecta, con foto del producto y firma.

**Acceptance (BDD):** Dada una devolución `pending` de FERRETERIA EPA CURRIDABAT y un viaje del 06-nov
que le entrega 2 pedidos, When se arma el 06-nov, Then la recolecta queda como parada 3 de ese viaje y
`pickup_date` = 2026-11-06.

**Estado: Implementado** (E2E en Aurora con ROLLBACK, 2026-11-05). Fuente: `recolectas.py`, `sql/60`.

### FR9 — Consultar los viajes: Calendario y Planificaciones

Como planificador, quiero ver los viajes armados por día y revisar sus paradas.

- FR9.1 El **Calendario** muestra los viajes por día en vistas de semana (**lunes a domingo**, para ver
  las entregas de fin de semana), mes y tabla, con filtro por zona.
- FR9.2 **Planificaciones** lista los planes por fecha.
- FR9.3 La tarjeta del viaje muestra:
  - el número de viaje y el camión;
  - las barras de capacidad (peso y volumen);
  - las paradas en orden, con etiquetas **"Retira"** (cliente retira) y **"Recolecta"**;
  - el mapa con el trayecto.
- FR9.4 El detalle de la parada se abre en un modal. Una recolecta muestra el motivo de la devolución.
  Los pedidos del mismo punto comparten color, y tocar un punto con varios pedidos abre una tabla.
- FR9.5 Cambiar el contexto operativo vuelve a consultar los datos sin recargar.

**Estado: Implementado.** Fuente: `src/pages/planificacion/*` (`CalendarioPlanificacion`, `PlanesTab`,
`PlanTripCard`, `StopBadges`, `ParadaModal`, `TripMapa`).

### FR10 — Iniciar sesión con Google (transversal al TMS)

Como usuario de OLO o de Intelix, quiero entrar al TMS con mi cuenta corporativa de Google, sin
manejar otra contraseña. Lo construyó el equipo de Planificación el 2026-11-05 a pedido de Palencia.

- FR10.1 La pantalla de login muestra el botón oficial **"Iniciar sesión con Google"** debajo del
  formulario, con la leyenda "Solo cuentas @ologistics.com o @intelix.biz".
- FR10.2 Solo entran correos de **`ologistics.com`** e **`intelix.biz`**. Cualquier otro ve el aviso
  *"Solo pueden iniciar sesión cuentas de @ologistics.com o @intelix.biz. Entra con tu correo
  corporativo."* El dominio se valida dos veces: en la Lambda de Google y en la Lambda de auth.
- FR10.3 El token de Google se valida en el backend contra Google: firma, que el cliente (`aud`) sea el
  nuestro, el emisor y que el correo esté verificado. Un token de otra app o vencido se rechaza.
- FR10.4 Si el correo ya tiene usuario, entra con su rol. Si no lo tiene, se **crea sin rol** (no ve
  ningún módulo hasta que un admin le asigne uno desde Administración → Usuarios). Un usuario
  desactivado no entra.
- FR10.5 La sesión es el mismo JWT del login con contraseña. El alta y el login quedan en la
  bitácora de auditoría con `method: google`.
- FR10.6 El ID del cliente OAuth vive en configuración, uno por ambiente: SSM
  `/<env>/tms/google-client-id` en el backend y `VITE_GOOGLE_CLIENT_ID` en el frontend. El secreto del
  cliente no se usa ni se guarda.

**Acceptance (BDD):** Dado un correo `@gmail.com`, When intenta entrar con Google, Then ve el aviso de
dominio y no se crea usuario. Dado `jaraujo@intelix.biz` sin usuario, When entra, Then se crea sin rol
y entra a una sesión vacía.

**Estado: Implementado y desplegado** (2026-11-05; probado con una cuenta real `@intelix.biz`).
Fuente: `backend/auth/google/google_login.py` (Lambda fuera de la VPC), `backend/auth/src/app.py`
(`google_login`), `backend/auth/template.yaml` (`POST /api/auth/google`),
`src/pages/login/components/GoogleLoginButton.tsx`, `src/lib/google-identity.ts`,
`src/lib/google-login.ts`. Cliente OAuth "TMS login" en el proyecto de Google Cloud
`sistema-tms-513814`, publicado en producción.

### FR11 — Estándar de base de datos OLTP Intelix (transversal al TMS)

Como equipo de Intelix, queremos que la base `tms_olo` cumpla el estándar de nombres de Intelix, para
que todos los módulos la escriban y la mantengan igual. Lo ejecutó el equipo de Planificación el 2026-11-03.

- FR11.1 Todas las tablas propias usan el prefijo **`tbl_`** (96, incluidas `audit.tbl_events` y sus
  particiones); las vistas, `vw_`; las secuencias, `seq_`; y las restricciones, índices y triggers,
  `pk_`, `fk_`, `uq_`, `ck_`, `idx_`, `uidx_` y `trg_` (281 restricciones, 185 índices y 87 triggers).
  Todo en minúsculas, snake_case y ASCII.
- FR11.2 Excepciones documentadas:
  - `sim_expedicionescabecera` (la tabla de simulación de eFlow);
  - `schema_migrations` y `mobile_migrations`;
  - los objetos de PostGIS;
  - las funciones que el código llama por nombre.
- FR11.3 El código de todos los backends, del servidor y de los scripts usa los nombres físicos. El
  contrato HTTP (`/api/data/<tabla>`) sigue con nombres lógicos y se traduce en un solo lugar
  (`tms_common/db_names.py`).
- FR11.4 Durante la transición hubo **vistas de compatibilidad** con los nombres viejos, para no romper
  los despliegues. Se retiraron el 2026-11-05 (`sql/61` y `sql/62`), después de redesplegar todos los stacks.
- FR11.5 Toda migración nueva sigue la guía `sql/README.md`: nombres físicos, prefijos, ROLLBACK y
  validación, y ensayo antes de `--execute`.

**Estado: Implementado** en Aurora `tms_olo` (`sql/59`, `sql/61`–`sql/63`; ADR-0005). Verificado:
`tms_app` lee y escribe por los nombres nuevos; CloudWatch sin errores de tabla inexistente; pytest en verde.

## Requerimientos no funcionales

- **NFR1 — Stack Intelix:** Python 3.13 sobre AWS Lambda (SAM), API Gateway HTTP compartida
  (`common-services`), Aurora PostgreSQL 17 y frontend React en Amplify. Un stack por servicio
  (`dev-tms-planning`); toda ruta de `ROUTES` tiene que estar declarada en el `template.yaml` (lo
  verifica `test_routes_wired.py`).
- **NFR2 — Estándar OLTP Intelix:** tablas `tbl_*`, restricciones con prefijo (`pk_`, `fk_`, `ck_`,
  `idx_`, `trg_`) y migraciones con ROLLBACK y validación (`sql/README.md`, ADR-0005). Desde la `sql/61`
  ya no existen las vistas con nombres viejos.
- **NFR3 — Idempotencia:** ingesta y armado repetibles sin duplicar (UPSERT por llave de eFlow; el
  rearmado borra y reconstruye solo lo no liberado).
- **NFR4 — Seguridad:**
  - SQL siempre parametrizado;
  - permisos por módulo (`planificacion:view` y `planificacion:edit`), con el cambio de fecha solo para admin;
  - auditoría por trigger en las tablas;
  - sin credenciales en el repo (Secrets Manager y SSM).
- **NFR5 — Disponibilidad del dato:** el replan corre cada hora en días hábiles. Aurora está encendida
  de lunes a viernes de 04:45 a 17:00 (hora CR).
- **NFR6 — Degradación con gracia:**
  - pedido sin coordenadas: va al final de la ruta y el lead time cae al piso de 1 día;
  - eFlow no disponible: se planifica con lo último ingestado;
  - pedido que excede la capacidad: viaje propio.
- **NFR7 — Interfaz bilingüe** (es/en, claves `planning.*`) usando el design system del repo.
- **NFR8 — Calidad:** `pytest backend/tests` en verde (560 al 2026-11-05) y `vitest` en verde; los
  archivos respetan los topes de tamaño de `standards/code-quality.md`.

## Restricciones

- **C1 — eFlow es de solo lectura** para Planificación. El write-back (número de viaje) va al espejo
  hasta que lleguen las APIs de EPRAC.
- **C2 — Planificación no prioriza ni libera.** Eso es del OMS (liberación un día antes de la salida, ADR-013).
- **C3 — El orden lo manda la fecha de entrega.** Se planifica para la fecha del cliente; la salida se
  calcula hacia atrás.
- **C4 — Solo flota propia** (`carrier_id` nulo). El transportista tercero no se asigna todavía (OQ-6).
- **C5 — Una compañía por plan:** los viajes no mezclan compañías.
- **C6 — Costa Rica primero.** La ingesta y las constantes (depósito, organización, almacén) son de CR.
  Venezuela no se planifica todavía.

## Supuestos

- **A1** El cliente destino ya existe en `tbl_final_customers` con su tipo (`TIENDA`/`MAYOREO`); si no,
  el pedido no se ingesta.
- **A2** El peso y el volumen de eFlow (`PESOPEDIDO_TOTAL`, `CUBICAJEPEDIDO_TOTAL`) son confiables.
- **A3** Las tiendas EPA son pocas y fijas (8 en CR), así que un viaje por tienda no satura la flota.
- **A4** Una devolución trae pocos artículos y no compromete la capacidad del camión.

## Fuera de alcance (de esta entrega)

- Escribir en eFlow real (situación, prioridad, número de viaje): depende de las APIs de EPRAC.
- Rutas solo de recolección (muchas devoluciones juntas).
- Partir un pedido en varias guías por línea.
- Piso de capacidad mínima para que salga el viaje (~80 %).
- Planificación de Venezuela.
- Motor de ruteo por calles definitivo (proveedor pago).

## Open Questions

- **OQ-1 — ¿La bandeja muestra solo lo no planificado?** Se pidió que sí. Pero el replan planifica cada
  hora todo lo que está dentro de los próximos 3 días, y el cambio de fecha (FR3) se hace desde la
  bandeja. Si se ocultan los planificados, no se le puede cambiar la fecha a un pedido de mañana.
  Owner: líder de proyecto y Chus.
- **OQ-2 — Días de anticipo por zona:** se decidió (2026-11-05) que el catálogo de zonas tenga
  cercana/lejana y días de anticipo, por compañía y país, en lugar del cálculo por km. Falta construirlo.
- **OQ-3 — Coordenadas de las tiendas EPA:** eFlow no trae lat/long (`CLIENTES.LATITUD`), así que el
  lead time de EPA queda siempre en el piso de 1 día.
- **OQ-4 — Cierre de pedidos desde eFlow:** el TMS no recibe cuándo se cierra un pedido (`closed_at`).
  Hay pedidos de octubre que siguen "abiertos" y que el Panel del OMS cuenta como planificados sin
  fecha de salida (32 al 2026-11-05: viajes de octubre armados antes de que existiera `dispatch_date`).
- **OQ-5 — `NUMEROVIAJEWMH` real:** confirmar con eFlow que acepta 15 dígitos (`YYYYMMDDCCCCNNN`).
- **OQ-6 — Transportista tercero:** el viaje sale sin chofer ni vehículo y el transportista los
  informa después. No es urgente (reunión 2026-11-03).
- **OQ-7 — Capacidad de las recolectas:** cuándo sumar el peso y el volumen de la devolución.
- **OQ-8 — Cambio de fecha a eFlow:** la fecha cambiada vive solo en el TMS.

## Requerimientos técnicos (ítems de trabajo)

| # | Requerimiento | Estado | Depende de |
|---|---|---|---|
| R001 | Ingesta eFlow DISP/DISP → `tbl_orders` + espejo + líneas | Delivered | — |
| R002 | Armado automático por capacidad (zona / tienda / retira) | Delivered | R001 |
| R003 | Fecha de salida, lead time y número de viaje con compañía | Delivered | R002 |
| R004 | Replan programado + viajes congelados | Delivered | R002 |
| R005 | Contrato de handoff Planificación → OMS en `tbl_orders` | Delivered | R002 |
| R006 | Bandeja con devoluciones + cambio de fecha (admin) | Delivered | R001 |
| R007 | Recolectas como paradas `collection` (`sql/60`) | Delivered | R002 |
| R008 | Estándar OLTP en la base (`sql/59`, retiro de las vistas `sql/61–63`) | Delivered | — |
| R009 | Días de anticipo por zona (catálogo de zonas) | Draft | R003 |
| R010 | Write-back real a eFlow vía APIs de EPRAC | Blocked (EPRAC) | R003 |
| R011 | Sincronizar el cierre de pedidos desde eFlow | Draft | R001 |
| R012 | Capacidad de las recolectas y rutas solo de recolección | Draft | R007 |
| R013 | Login con Google para `ologistics.com` e `intelix.biz` (FR10) | Delivered | — |
| R014 | IDs de cliente de Google para qa/prod en SSM (`/qa`, `/prod`) | Draft | R013 |

**Contrato de columnas en `tbl_orders` (R005):**

| Columna | La escribe | Significado |
|---|---|---|
| `numero_viaje` | Planificación | `YYYYMMDD-CCCC-NNN` |
| `lead_time_days` | Planificación | días de tránsito (≥ 1) |
| `dispatch_date` | Planificación | `delivery_date − lead_time_days` |
| `planning_run_id` | Planificación | uuid de la corrida |
| `delivery_date_*` | Planificación (cambio de fecha) | autor, fecha, contador, fecha de eFlow |
| `priority`, `oms_score`, `wms_situation`, `oms_processed_at`, `prioritization_run_id` | OMS | Planificación no las toca |

## Sources

- Código: `backend/planning/src/*`, `backend/tracking/src/app.py` y `backend/mobile/src/mobile_api/start.py`
  (inicio del viaje), `src/pages/planificacion/*`, `src/pages/oms/bandeja/*`.
- Migraciones: `sql/37`, `sql/39`, `sql/42`, `sql/56`–`sql/63`; guía `sql/README.md`; ADR-0005.
- Bitácoras: `docs/work/2026-10/` y `docs/work/2026-11/` (replan, bandeja, EPA, número de viaje, recolectas).
- Reuniones: 2026-10-10 (Carlos, flujo), 2026-10-15 (Antonio, viaje y T-1), 2026-10-19/20 (zonas y
  envío un día antes), 2026-10-21 (APIs EPRAC), 2026-11-03 (bandeja, EPA y fines de semana), 2026-11-04
  (fechas de cierre), 2026-11-05 (recolectas y anticipo por zona).

## Review

Documento escrito a mano por pedido del responsable del módulo, siguiendo la estructura de AI-DLC
(intención, actores, glosario, FR con BDD, NFR, restricciones, supuestos, OQ), sin correr el workflow.
Refleja el estado desplegado al 2026-11-05. Pendiente: revisión de la líder de proyecto.
