# Historias de usuario — Módulo de Planificación

**Fecha de corte: 2026-11-05.** Versión para la ficha del proyecto. Los cambios posteriores se
manejan como gestión de cambios.

**Qué hace el módulo:** toma de eFlow los pedidos disponibles (DISP/DISP), los muestra en la Bandeja
junto con las devoluciones y, cada hora, arma solo los viajes de cada día y compañía:
- respeta la capacidad del camión;
- consolida el mayoreo por zona;
- manda a EPA en viaje directo por tienda;
- aparta lo que el cliente retira;
- mete las recolectas en viajes que ya pasan por el cliente.

Además calcula la fecha de salida y el número de viaje, que el OMS usa para priorizar y liberar.

El equipo también entregó dos piezas transversales del TMS: el **login con Google** (historia 014) y
el **estándar de base de datos** (renombrado `tbl_*`, requerimiento FR11 / R008).

Cada historia lleva criterios de aceptación en formato **Given / When / Then** y al menos un escenario
de prueba con datos. La referencia `FRx` remite al
[documento de requerimientos](../../requirements/planificacion/documento-de-requerimientos-planificacion.md).

**Qué cambió respecto de la versión del 2026-10-21:**
- Se retiraron las historias del flujo manual (generar, regenerar con alerta, editar, confirmar y
  estado por viaje), porque la planificación ahora es automática.
- La 008 (handoff al OMS) se conserva, actualizada.
- La 007 (partir un pedido por línea) queda fuera de alcance de esta entrega (ver requerimientos).

## Índice

| # | Historia | Estado | FR | Depende de |
|---|---|---|---|---|
| [001](#001--traer-los-pedidos-disponibles-de-eflow) | Traer los pedidos disponibles de eFlow | Delivered | FR1 | — |
| [002](#002--ver-la-bandeja-de-pedidos-y-devoluciones) | Ver la bandeja de pedidos y devoluciones | Delivered | FR2 | 001 |
| [003](#003--cambiar-la-fecha-de-entrega-de-un-pedido) | Cambiar la fecha de entrega de un pedido | Delivered | FR3 | 002, 004 |
| [004](#004--armar-los-viajes-por-capacidad-sin-intervención) | Armar los viajes por capacidad sin intervención | Delivered | FR4 | 001 |
| [005](#005--epa-viaje-directo-por-tienda) | EPA: viaje directo por tienda | Delivered | FR4.2 | 004 |
| [006](#006--cliente-retira-sin-camión) | Cliente retira: sin camión | Delivered | FR4.2 | 004 |
| [007](#007--fecha-de-salida-y-número-de-viaje) | Fecha de salida y número de viaje | Delivered | FR5 | 004 |
| [008](#008--entregar-el-plan-al-oms) | Entregar el plan al OMS | Delivered | FR7 | 004, 007 |
| [009](#009--mantener-el-plan-al-día-sin-romper-lo-liberado) | Mantener el plan al día sin romper lo liberado | Delivered | FR6 | 004, 008 |
| [010](#010--recoger-las-devoluciones-en-viajes-que-ya-pasan-por-el-cliente) | Recoger las devoluciones en viajes que ya pasan por el cliente | Delivered | FR8 | 004 |
| [011](#011--consultar-los-viajes-en-el-calendario) | Consultar los viajes en el calendario | Delivered | FR9 | 004 |
| [012](#012--días-de-anticipo-por-zona) | Días de anticipo por zona | Partial | OQ-2 | 007 |
| [013](#013--bandeja-solo-con-pedidos-sin-planificar) | Bandeja solo con pedidos sin planificar | Draft (decisión pendiente) | OQ-1 | 002 |
| [014](#014--iniciar-sesión-con-google) | Iniciar sesión con Google (transversal) | Delivered | FR10 | — |

---

## 001 — Traer los pedidos disponibles de eFlow

- **Status:** Delivered · **Date:** 2026-11-05 · **FR:** FR1

### Narrative

Como sistema de planificación, quiero copiar a Aurora los pedidos que eFlow tiene disponibles, para
planificar sobre ellos sin depender de eFlow en cada consulta.

### Acceptance criteria

1. **Given** un pedido de eFlow en DISP/DISP, sin cierre, sin viaje y con entrega desde hoy,
   **When** corre la ingesta, **Then** queda en `tbl_orders` con su compañía, cliente destino,
   sucursal, peso, volumen, observaciones y líneas.
2. **Given** el mismo pedido ya ingestado, **When** la ingesta vuelve a correr, **Then** no se duplica:
   se actualizan sus datos.
3. **Given** un pedido de EPA para la tienda `008`, **When** se ingesta, **Then** queda amarrado a
   `T008 CARTAGO` **de EPA**, no al `008` de Cofersa.
4. **Given** observaciones como "CLIENTE RETIRA" o "PASAN A RETIRAR", **When** se ingesta, **Then** el
   pedido queda marcado `es_cliente_retira`.
5. **Given** un pedido cuya fecha cambió un admin, **When** se re-ingesta, **Then** conserva la fecha
   del admin y guarda la de eFlow en `delivery_date_eflow`.

### Edge cases

- Si la compañía, el cliente destino o la sucursal no existen en Aurora, el pedido no se ingesta y queda listado en `faltantes`.
- Si eFlow no está disponible, el replan sigue con lo último ingestado.

### Test scenarios

- **Ingesta sin duplicar:** correr `ingest_cr(dry_run=True)` dos veces → mismo `leidos`/`upserted`, 0 `saltados` (33/33 el 2026-11-05).

### Validation

- 2026-11-05: la ingesta dry-run contra eFlow resolvió 33 de 33. Se corrigieron 28 pedidos EPA que estaban mal amarrados.

---

## 002 — Ver la bandeja de pedidos y devoluciones

- **Status:** Delivered · **Date:** 2026-11-03 · **FR:** FR2

### Narrative

Como planificador, quiero ver en un solo lugar los pedidos por entregar y las devoluciones por
recoger, para saber qué tengo que atender.

### Acceptance criteria

1. **Given** pedidos DISP/DISP y devoluciones `pending`/`approved`, **When** abro la Bandeja de
   pedidos, **Then** veo ambos, y las devoluciones llevan la etiqueta **"Devolución"**.
2. **Given** la bandeja abierta, **When** filtro por Tipo Delivery o Pickup, **Then** veo solo
   entregas o solo devoluciones.
3. **Given** una devolución `completed` o `rejected`, **When** abro la bandeja, **Then** no aparece.
4. **Given** una devolución ya agendada en un viaje, **When** abro la bandeja, **Then** su fecha es
   la de recolección agendada.
5. **Given** cambio el almacén o la compañía en el encabezado, **When** la bandeja recarga, **Then**
   muestra solo lo de ese alcance.

### Test scenarios

- **Devolución en la bandeja:** crear una devolución `pending` sobre un pedido de Cofersa → abrir la
  Bandeja → filtrar Pickup → se ve con la etiqueta "Devolución" y los datos del cliente del pedido original.

---

## 003 — Cambiar la fecha de entrega de un pedido

- **Status:** Delivered · **Date:** 2026-11-03 · **FR:** FR3

### Narrative

Como administrador, quiero cambiar la fecha de entrega de un pedido cuando el cliente lo pide para
otro día, para que salga en el viaje correcto y quede registrado quién lo cambió.

### Acceptance criteria

1. **Given** un pedido sin liberar, **When** un admin elige una fecha nueva desde el detalle en la
   bandeja, **Then** el pedido sale del viaje del día viejo y entra en uno del día nuevo.
2. **Given** el cambio hecho, **When** reviso el pedido, **Then** tiene el autor, la fecha del cambio,
   el contador de cambios + 1 y la fecha original de eFlow.
3. **Given** un usuario que no es admin, **When** intenta cambiar la fecha, **Then** recibe 403 y no
   ve la opción.
4. **Given** un pedido ya liberado a eFlow, **When** se intenta cambiar, **Then** se rechaza (409).
5. **Given** una fecha pasada, **When** se intenta guardar, **Then** se rechaza (400).

### Edge cases

- Si el pedido se mueve a **hoy**, el replan automático no lo arma, porque su ventana empieza mañana.

### Test scenarios

- **Mover EPA de día:** el pedido EPA `2000019231` del 06-nov pasa al 05-nov → queda en el viaje del
  05, `delivery_date_eflow` = 06-nov, contador = 1, autor = el admin.

### Validation

- 2026-11-03: verificado contra Aurora y eFlow en una transacción con ROLLBACK (casos 400, 409 y re-ingesta).

---

## 004 — Armar los viajes por capacidad sin intervención

- **Status:** Delivered · **Date:** 2026-11-05 · **FR:** FR4

### Narrative

Como coordinador de transporte, quiero que el sistema arme solo los viajes de cada día, llenando los
camiones sin pasarse de su capacidad, para no armarlos a mano ni sobrecargar.

### Acceptance criteria

1. **Given** los pedidos DISP/DISP de un día y una compañía, **When** se arma el plan, **Then** cada
   pedido queda en exactamente un viaje.
2. **Given** pedidos de mayoreo, **When** se arman, **Then** se agrupan por **zona**, y los que no
   tienen zona van a "S/R".
3. **Given** un grupo que no cabe en un camión, **When** se arma, **Then** se abren tantos viajes como
   hagan falta, sin pasar del **85 % del peso, el 95 % del volumen ni las 16 paradas**.
4. **Given** varios viajes en el día, **When** se asignan camiones, **Then** se usa la flota propia
   activa, de mayor a menor capacidad, y sin repetir camión.
5. **Given** las paradas de un viaje, **When** se ordenan, **Then** siguen el camino desde el depósito
   (vecino más cercano), con los pedidos del mismo punto juntos y los que no tienen coordenadas al final.
6. **Given** que no hay flota propia activa, **When** hay pedidos que planificar, **Then** el armado
   falla con 409 "No hay flota propia activa".

### Edge cases

- Si un solo pedido supera la capacidad del camión, va igual, solo en su viaje, y la barra de capacidad lo marca.

### Test scenarios

- **Zona que no cabe:** 20 pedidos de Cofersa en la misma zona → 2 viajes (16 + 4), ninguno por encima de los márgenes.

---

## 005 — EPA: viaje directo por tienda

- **Status:** Delivered · **Date:** 2026-11-05 · **FR:** FR4.2

### Narrative

Como coordinador de transporte de EPA, quiero que cada tienda tenga su propio viaje, para mandar el
camión lleno a una sola tienda en lugar de mezclar tiendas en un recorrido.

### Acceptance criteria

1. **Given** pedidos EPA para T005, T006 y T008 el mismo día, **When** se arma el plan, **Then** salen
   **3 viajes**, uno por tienda, y cada viaje lleva el nombre de su tienda como grupo.
2. **Given** los pedidos de una tienda que no caben en un camión, **When** se arma, **Then** salen
   varios viajes para esa misma tienda.
3. **Given** pedidos de Cofersa del mismo día, **When** se arma, **Then** siguen agrupados por zona
   (no les afecta la regla de EPA).

### Test scenarios

- **EPA del 06-nov:** T005 (2 pedidos), T006 y T008 → `20261106-0029-001`, `-002` y `-003`, cada uno a una tienda.

### Validation

- 2026-11-05: replan desplegado → `20261108-0029-001` directo a T008; el 06-nov quedó en 3 viajes, uno por tienda.

---

## 006 — Cliente retira: sin camión

- **Status:** Delivered · **Date:** 2026-10-20 · **FR:** FR4.2

### Narrative

Como coordinador, quiero que los pedidos que el cliente pasa a recoger no ocupen un camión, para no
gastar capacidad en algo que no se reparte.

### Acceptance criteria

1. **Given** pedidos marcados `es_cliente_retira`, **When** se arma el día, **Then** quedan en un
   grupo **RETIRA** sin camión y sin límite de capacidad.
2. **Given** ese grupo, **When** lo veo en la tarjeta, **Then** cada parada lleva la etiqueta **"Retira"**.
3. **Given** una devolución del día, **When** se agenda (010), **Then** nunca entra al grupo RETIRA.

---

## 007 — Fecha de salida y número de viaje

- **Status:** Delivered · **Date:** 2026-11-05 · **FR:** FR5

### Narrative

Como OMS y como bodega, quiero que cada viaje tenga una fecha de salida y un número único, para saber
cuándo alistar y con qué número despacharlo en eFlow.

### Acceptance criteria

1. **Given** un viaje armado, **When** se guarda, **Then** todos sus pedidos tienen el mismo
   `lead_time_days` (≥ 1) y la misma `dispatch_date = entrega − lead_time`.
2. **Given** un viaje sin coordenadas en ninguna parada, **When** se guarda, **Then** el lead time es
   1 día (nunca nulo).
3. **Given** viajes de Cofersa y de EPA el mismo día, **When** se numeran, **Then** no se repiten:
   `YYYYMMDD-0109-NNN` y `YYYYMMDD-0029-NNN`.
4. **Given** el viaje guardado, **When** reviso el espejo de eFlow, **Then** `NUMEROVIAJEWMH` tiene el
   número sin guiones (por ejemplo `202611060029001`).

### Test scenarios

- **Número con compañía:** armar el 08-nov de EPA → `20261108-0029-001`, y `NUMEROVIAJEWMH = 202611080029001` en el espejo.

---

## 008 — Entregar el plan al OMS

- **Status:** Delivered · **Date:** 2026-11-05 · **FR:** FR7

### Narrative

Como OMS, quiero encontrar en `tbl_orders` el viaje, la fecha de salida y la corrida de cada pedido
planificado, para priorizarlo y liberarlo un día antes de la salida.

### Acceptance criteria

1. **Given** un pedido que entró a un viaje, **When** termina el armado, **Then** tiene `numero_viaje`,
   `lead_time_days`, `dispatch_date` y `planning_run_id`, y aparece en la cola del OMS
   (`planning_run_id` no nulo y `oms_processed_at` nulo).
2. **Given** un pedido que se cayó del plan al rearmar, **When** termina el armado, **Then** esas
   columnas vuelven a NULL y sale de la cola del OMS.
3. **Given** cualquier armado, **When** termina, **Then** las columnas del OMS (`priority`,
   `wms_situation`, `oms_processed_at`, …) no cambiaron.

### Validation

- 2026-11-04/05: corrida de punta a punta. El barrido del OMS priorizó y liberó los planificados (111
  de Cofersa el 04-nov; los 4 de EPA del 06-nov el 05-nov).

---

## 009 — Mantener el plan al día sin romper lo liberado

- **Status:** Delivered · **Date:** 2026-11-03 · **FR:** FR6

### Narrative

Como coordinador, quiero que los viajes se rearmen solos a medida que entran pedidos, sin deshacer lo
que el OMS ya mandó a la bodega.

### Acceptance criteria

1. **Given** un día hábil entre las 05:00 y las 16:00 (hora CR), **When** llega la hora en punto,
   **Then** corre el replan: ingesta eFlow y rearma los próximos 3 días de cada almacén con cola.
2. **Given** un viaje con algún pedido ya liberado, **When** corre el replan, **Then** el viaje queda
   intacto: mismas paradas y mismo número.
3. **Given** pedidos nuevos o sueltos ese día, **When** corre el replan, **Then** van a viajes nuevos
   numerados después del último número usado.
4. **Given** un día con viajes ya despachados (`completed`/`cancelled`), **When** corre el replan,
   **Then** ese día no se toca.
5. **Given** un usuario con `planificacion:edit`, **When** pide replanificar, **Then** se ejecuta el
   mismo proceso a demanda.

### Validation

- 2026-11-03: el viaje EPA con 3 pedidos liberados quedó intacto, y el pedido suelto fue a `-002`.
  Programación activa en AWS (`dev-tms-planning-replan-horario`, ENABLED).

---

## 010 — Recoger las devoluciones en viajes que ya pasan por el cliente

- **Status:** Delivered · **Date:** 2026-11-05 · **FR:** FR8

### Narrative

Como servicio al cliente, quiero que la devolución que registré se recoja en el próximo viaje que pase
por ese cliente, sin armar una ruta aparte, para resolverla rápido y sin costo extra.

### Acceptance criteria

1. **Given** una devolución `pending` o `approved` y un viaje del día que **entrega a ese mismo
   cliente**, **When** se arma el día, **Then** la devolución entra como parada **"Recolecta"** en ese
   viaje, justo después de sus entregas.
2. **Given** que ningún viaje entrega a ese cliente pero sí hay uno de su zona (o de su tienda, si es
   EPA), **When** se arma, **Then** la recolecta va en ese viaje, al final.
3. **Given** que ningún viaje del día pasa por su zona, **When** se arma, **Then** la devolución queda
   sin agendar y se intenta de nuevo en el siguiente armado.
4. **Given** una recolecta agendada, **When** reviso la devolución, **Then** tiene `pickup_date` = el
   día del viaje, y la Bandeja muestra esa fecha.
5. **Given** un viaje ya liberado que pasa por ese cliente, **When** se arma, **Then** la recolecta
   también puede ir ahí (no va a eFlow).
6. **Given** el chofer inicia el viaje, **When** se crean las guías, **Then** la de la recolecta es de
   tipo `collection` y la devolución queda amarrada a ella. La app pide foto del producto y firma.
7. **Given** la recolecta en el viaje, **When** miro la capacidad, **Then** no suma peso ni volumen (v1).

### Edge cases

- Una devolución agendada para otro día no se mueve.
- Si el viaje de su día se rearma y la parada desaparece, la devolución se libera y vuelve a agendarse.

### Test scenarios

- **Recolecta tras las entregas del cliente:** devolución de prueba sobre FERRETERIA EPA CURRIDABAT
  (Cofersa) → armar el 06-nov → aparece en `20261106-002` como parada 3, después de sus 2 entregas, y
  `pickup_date` = 2026-11-06.

### Validation

- 2026-11-05: E2E en Aurora dentro de una transacción con ROLLBACK (sin dejar datos); `sql/60` aplicada.

---

## 011 — Consultar los viajes en el calendario

- **Status:** Delivered · **Date:** 2026-11-05 · **FR:** FR9

### Narrative

Como planificador, quiero ver los viajes armados por día, con sus paradas y su mapa, para revisar el
reparto y responder consultas.

### Acceptance criteria

1. **Given** viajes armados, **When** abro Planificación → Calendario, **Then** los veo por día en la
   vista de semana (**lunes a domingo**), de mes o de tabla, y puedo filtrar por zona.
2. **Given** un viaje, **When** abro su tarjeta, **Then** veo el número de viaje, el camión, las barras
   de peso y volumen, y las paradas en orden con sus etiquetas ("Retira", "Recolecta").
3. **Given** una parada, **When** la toco, **Then** se abre su detalle. Si es una recolecta, muestra el
   motivo de la devolución.
4. **Given** varios pedidos en el mismo punto, **When** toco el pin en el mapa, **Then** se abre la
   tabla del punto.
5. **Given** cambio el contexto operativo, **When** la vista recarga, **Then** muestra lo de ese alcance.

---

## 012 — Días de anticipo por zona

- **Status:** Partial · **Date:** 2026-11-06 · **Ref:** OQ-2 (reuniones 2026-11-05 y 2026-11-06)

### Narrative

Como coordinador, quiero que cada zona diga si es corta o larga y con cuántos días de anticipo se
alista, para que las zonas lejanas se preparen con tiempo.

### Reparto (reunión 2026-11-06)

- **Planificación** (entregado, `sql/64`): cada pedido guarda su zona TMS (`tms_zone_id`), la zona de
  `tbl_zones` cuya geocerca contiene la coordenada de entrega. Si varias la contienen, gana la más chica.
  El `delivery_zone` de eFlow no se toca.
- **OMS** (pendiente, Eduardo): días de anticipo (default 1) y tipo de zona en `tbl_zones`; lee los días
  desde la zona TMS del pedido.

### Acceptance criteria

1. **Given** un pedido con coordenada dentro de la geocerca de la zona 05, **When** entra o cambia su
   coordenada, **Then** `tms_zone_id` = zona 05. ✔
2. **Given** un pedido sin coordenada o fuera de toda geocerca de su país, **When** entra, **Then**
   `tms_zone_id` queda nulo y el OMS usa 1 día. ✔
3. **Given** una zona marcada larga con 2 días, **When** el OMS prioriza un pedido de esa zona TMS,
   **Then** lo libera 2 días antes de la salida. (OMS)
4. **Given** el catálogo, **When** se configura, **Then** el valor es por país (sin compañía). (OMS)

---

## 013 — Bandeja solo con pedidos sin planificar

- **Status:** Draft (decisión pendiente) · **Date:** 2026-11-05 · **Ref:** OQ-1

### Narrative

Como planificador, quiero que la bandeja muestre solo lo que todavía no está en un viaje, para ver qué
falta planificar.

### Acceptance criteria (propuestos)

1. **Given** un pedido con viaje asignado, **When** abro la bandeja, **Then** no aparece.
2. **Given** una devolución con recolecta agendada, **When** abro la bandeja, **Then** no aparece.

### Conflicto a resolver

El replan arma cada hora todo lo de los próximos 3 días, así que la bandeja quedaría casi vacía, y la
historia 003 (cambiar la fecha) se opera desde la bandeja. Si esta historia entra, el cambio de fecha
de los pedidos planificados tiene que moverse al detalle del viaje.

---

## 014 — Iniciar sesión con Google

- **Status:** Delivered · **Date:** 2026-11-05 · **FR:** FR10 (transversal al TMS)

### Narrative

Como usuario de OLO o de Intelix, quiero entrar al TMS con mi cuenta corporativa de Google, para no
tener otra contraseña más.

### Acceptance criteria

1. **Given** la pantalla de login, **When** la abro, **Then** veo el botón "Iniciar sesión con Google"
   y la leyenda de los dominios permitidos.
2. **Given** una cuenta `@ologistics.com` o `@intelix.biz` que ya tiene usuario, **When** entro con
   Google, **Then** entro con mi rol de siempre.
3. **Given** una cuenta de esos dominios sin usuario, **When** entro con Google, **Then** se me crea un
   usuario **sin rol** y no veo módulos hasta que un admin me asigne uno.
4. **Given** una cuenta de otro dominio (por ejemplo `@gmail.com`), **When** intento entrar, **Then**
   veo *"Solo pueden iniciar sesión cuentas de @ologistics.com o @intelix.biz. Entra con tu correo
   corporativo."* y no se crea nada.
5. **Given** un usuario desactivado, **When** entra con Google, **Then** ve "Tu usuario está desactivado".
6. **Given** un token de Google falso, de otra app o con el correo sin verificar, **When** llega al
   backend, **Then** se rechaza (401) sin tocar la base.

### Test scenarios

- **Alta por Google:** entrar con `jaraujo@intelix.biz` (sin usuario previo) → se crea sin rol → un
  admin le asigna SuperAdministrador → al recargar ve todos los módulos.
- **Dominio ajeno:** entrar con una cuenta `@gmail.com` → aviso de dominio, sin alta.

### Validation

- 2026-11-05: desplegado en el sandbox. La ruta rechaza el token falso (401) y la falta de token (400).
  La cuenta real `jaraujo@intelix.biz` se creó por Google y recibió rol. 11 pruebas automáticas
  (dominios, `aud`, `iss`, correo sin verificar, alta sin rol, usuario existente y desactivado).
