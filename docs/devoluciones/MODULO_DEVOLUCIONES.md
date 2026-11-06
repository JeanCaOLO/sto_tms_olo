# Módulo Devoluciones — documentación completa

> Ruta web: `/devoluciones` · Código: `src/pages/devoluciones/` (pantalla) y `src/lib/devoluciones/` (lógica pura) ·
> Backend: `backend/admin/` (rutas `/api/v1/devoluciones/*`) · Permiso: módulo `devoluciones` (`view`, `edit`, `export`).
> Migraciones: `sql/60`, `sql/61`, `sql/62`.
> Documento escrito el 2026-11-05 **a partir de la lectura del código** (solo lectura: no se consultó ni modificó la BD).
> Las rutas de archivo son relativas a la raíz del repo `TMS AHORA SI`, salvo que se indique otro repo.
> Para el cálculo de liquidaciones ver `docs/tarifador/MODULO_LIQUIDACIONES.md`.
> Lo que no se pudo confirmar en el código aparece marcado como **no verificado**.

---

## 1. Qué hace y qué NO hace

Responde una pregunta: **¿qué mercadería devuelta trajeron los camiones y ya se recibió en bodega?**

- Trabaja **por viaje** (una `tbl_routes`). Cada viaje muestra sus devoluciones agrupadas **por parada** (cliente / factura).
- Quien recibe (rol **Devoluciones**) marca cada devolución como **Recibida** (con cantidad y estado de la mercadería), o todas de una vez.
- Cuando **todas** las devoluciones de un viaje están recibidas, el viaje queda **"Listo para liquidar"**; el módulo de Liquidaciones
  bloquea liquidar un viaje mientras tenga devoluciones sin recibir (ver §7).
- Arma **formularios de devolución** imprimibles (número `DEV-AAAA-MM-####`) con las devoluciones que se marquen. Un viaje puede tener varios formularios; una devolución va en uno solo.

Lo que NO hace:
- **No crea viajes ni pedidos.** Los viajes y las paradas son de Guía de Despacho / Planificación; aquí solo se leen.
- **No crea devoluciones desde la web.** Las devoluciones nacen en la **app del chofer** (contracamión, `backend/mobile`). El origen
  «recolecta» (que pediría Atención al Cliente) **no existe todavía** en el código: ver `pendientes/02-flujo-recolecta.md`.
- **No liquida, no calcula tarifas ni cambia lo que se paga.** Solo bloquea (vía backend de Liquidaciones) mientras haya devoluciones sin recibir.
- **No valida la cantidad contra el pedido** (ver `pendientes/03-validar-cantidad-contra-pedido.md`).
- **No descarta ni rechaza devoluciones desde la pantalla**: no existe ninguna acción que deje una devolución en `rejected` o `cancelled`.
- **No borra** formularios ni devoluciones.

---

## 2. Pantalla (`/devoluciones`)

Archivo principal: `src/pages/devoluciones/page.tsx`. Ruta registrada en `src/router/config.tsx:131-132`; entrada de menú en
`src/components/feature/sidebar-nav-items.ts:93` (`permKey: 'devoluciones'`).

| Zona | Qué muestra | Dónde |
|---|---|---|
| Encabezado | Título y texto: "Recibe en bodega la mercadería devuelta…" | `page.tsx:40-45` |
| 4 tarjetas (`StatCard`) | **Viajes con devoluciones**, **Viajes por recibir**, **Listos para liquidar**, **Devoluciones por recibir**. Vienen de `GET /resumen` | `page.tsx:47-52`, `useReturnTrips.ts` |
| Pestañas | **Por recibir** (`pendientes`), **Listos para liquidar** (`recibidos`), **Todos** (`todos`) | `page.tsx:17-21`, `TabBar` |
| Filtro de fechas | `DateRangeFilter` sobre la **fecha del viaje**. Por defecto `rangeFor('all')`: sin límite | `page.tsx:35`, `admin_returns.py:102-109` |
| Lista de viajes | Una tarjeta `TripCard` por viaje, en orden de fecha descendente y número descendente, máximo **500** | `page.tsx:70-72`, `admin_returns_sql.py:17-22` |

**Mensajes vacíos** por pestaña (`page.tsx:22-26`): "No hay viajes con devoluciones por recibir.", "Ningún viaje tiene todas sus
devoluciones recibidas en este periodo.", "No hay viajes con devoluciones en este periodo.".

**Tarjeta de viaje** (`src/pages/devoluciones/parts/TripCard.tsx`), colapsada por defecto:
- Cabecera: número de viaje, fecha, transportista y conductor; contador de formularios; progreso `recibidas/total`;
  insignia **"Listo para liquidar"** (verde) o **"N por recibir"** (ámbar) (`TripCard.tsx:79-81`).
- Al abrir (carga `GET /viajes/{routeId}` con `useTripDetail`):
  - lista de formularios del viaje (botón por cada uno, abre `ReturnFormModal` con `GET /formularios/{id}`);
  - botón **Crear formulario (n)** — deshabilitado si no hay devoluciones marcadas (`TripCard.tsx:104-109`);
  - botón **Recibir todas** — visible si `canEdit` y el viaje tiene `pending_returns > 0` (`TripCard.tsx:110-114`);
  - la tabla de líneas (`ReturnLinesTable`);
  - si está lista: "Todas las devoluciones están recibidas: el viaje ya puede liquidarse." (`TripCard.tsx:125`).

**Tabla de líneas** (`src/pages/devoluciones/parts/ReturnLinesTable.tsx`), agrupada por parada (cabecera con casilla de grupo,
cliente, factura y dirección):

| Columna | Contenido | Fuente |
|---|---|---|
| (casilla) | Marcar la devolución para un formulario nuevo. Deshabilitada si ya tiene formulario (`isSelectable`) | solo si `canEdit` |
| Devolución | `return_number` | `tbl_returns` |
| Tipo | Insignia: **Contracamión** (azul) o **Recolecta** (ámbar) | `returnTypeLabel`, `ReturnLinesTable.tsx:68` |
| Producto | nombre, código entre paréntesis y enlace **"Ver foto"** si `photo_url` trae URL firmada | `ReturnLinesTable.tsx:70-78` |
| Motivo | `reason` (texto que escribió el chofer) | |
| Cant. / Recibido | `quantity` y `receivedQuantity` (solo si está recibida o completada) | `trips.ts:129-130` |
| Estado | Insignia con `statusLabel` / `statusVariant` | `trips.ts:10-25` |
| Formulario | `form_number` al que ya pertenece, o "-" | |
| (botón) | **Recibido** — solo si `canReceive` y la línea está abierta (`pending`/`approved`) | `ReturnLinesTable.tsx:85-89` |

**Diálogo de recepción** (`components/ReceiveModal.tsx`): de **una** línea pide *Cantidad recibida* (entero ≥ 0, precargado con
lo registrado por el chofer) y *Estado de la mercadería* (`Bueno` / `Dañado` / `Incompleto`, por defecto `Bueno`).
De **todas** solo pide el estado; no pide cantidad (`ReceiveModal.tsx:55-57`).

**Formulario** (`components/ReturnFormModal.tsx`, ancho máximo `max-w-4xl`): ver §3.4 a §3.6.

**Permisos en pantalla** (`src/hooks/use-module-permissions.ts`): `canEdit = can('devoluciones','edit')` y
`canExport = can('devoluciones','export')`. `canEdit` habilita recibir, marcar y guardar formularios; `canExport` habilita **Imprimir**
(`ReturnFormModal.tsx:148`). En pantalla no hay otros controles por rol.

**Selector de país:** esta pantalla **no usa** `CountryScopeBar` (no está importado en `page.tsx`). Ver §12.

---

## 3. Flujo de trabajo

### 3.1 Llega una devolución (de la app del chofer)

La devolución la registra el chofer en la parada, en la app (detalle en §6). El servidor escribe una fila en `tbl_returns` por
artículo, con `return_type = 'contracamion'`, `status` sin escribir (ver nota en §6.3) y la foto como llave S3.
Desde ese momento aparece en la pestaña **Por recibir** del viaje correspondiente. La devolución también aparece en la Bandeja de
Planificación (§8).

### 3.2 Recibir una devolución (una línea)

1. En la tarjeta del viaje, **Recibido** en la línea (solo si está `pending` o `approved`).
2. `ReceiveModal`: cantidad y estado → **Confirmar recibido**.
3. `POST /api/v1/devoluciones/{returnId}/recibir` con `{ received_quantity, condition }` (`receiveReturn`, `devolucionesApi.ts:43-44`).
4. Servidor (`admin_returns.py:163-185`): valida, actualiza `status='received'`, `received_at`, `received_by` (usuario del token),
   `received_quantity`, `received_condition`; escribe bitácora (`audit.record`, acción `recibir`).
5. La pantalla recarga el viaje y el resumen (`changed()` en `TripCard.tsx:43`).

### 3.3 Recibir todas las pendientes del viaje

1. **Recibir todas** (solo si quedan pendientes) → `ReceiveModal` sin cantidad, solo estado.
2. `POST /api/v1/devoluciones/viajes/{routeId}/recibir-todas` con `{ condition }` (`admin_returns.py:188-196`).
3. Servidor: un solo `UPDATE` sobre las devoluciones del viaje en `pending`/`approved`, con `received_quantity = rt.quantity`
   (**no reinterpreta cantidades**, `admin_returns_sql.py:173-182`). Bitácora con el número recibido.
4. Si no había pendientes, responde **200 con `received: 0`** (no es error).

### 3.4 Armar un formulario con devoluciones elegidas

1. En la tabla, marcar las casillas (solo las que **no** tienen formulario). La casilla de la parada marca/desmarca todas las
   seleccionables del grupo.
2. **Crear formulario (n)** abre `ReturnFormModal` con `newFormView(detail, selected)` (`trips.ts:175-185`): solo las devoluciones
   marcadas y solo las paradas que las tienen. Sin guardar: `form` es `null` y el título dice "sin guardar (el número se asigna al guardar)".
3. El borrador se prellena (`draftFromDetail`, `trips.ts:93-108`):
   - **Transporte** = transportista + " - " + conductor (`admin_returns.py:82-83`), si el formulario aún no tiene uno.
   - **Por parada** (`SECTIONS_SQL`, `admin_returns_sql.py:55-71`): código, nombre y teléfono del cliente final, factura y dirección
     del pedido, y **Ruta** = número de viaje. **Vendedor(es)** queda vacío (`NULL::text`).
   - Lo que ya se guardó en el formulario **manda** sobre lo que sabe el tracking (`FORM_SECTIONS_SQL` usa `COALESCE(s.campo, tracking)`).
4. Quien llena completa los campos del formulario (ver §3.5) y pulsa **Guardar formulario**.
5. `POST /api/v1/devoluciones/viajes/{routeId}/formularios` con `{...campos, sections, return_ids}` (`createForm`, `devolucionesApi.ts:50-51`).
   Servidor (`admin_returns.py:243-274`): ver reglas en §5.5. Al guardar, la tarjeta deja de marcar esas devoluciones y el formulario
   aparece en la lista del viaje.

### 3.5 Editar un formulario ya guardado

1. Abrir el formulario desde la lista del viaje → `GET /api/v1/devoluciones/formularios/{formId}`.
2. Cambiar campos o secciones → **Guardar formulario** → `PUT /api/v1/devoluciones/formularios/{formId}` (`updateForm`).
3. Servidor (`admin_returns.py:277-294`): actualiza la cabecera y hace *upsert* de las secciones. **No cambia las devoluciones que lleva**
   (para cambiarlas habría que crear otro formulario; no existe acción de "quitar del formulario").

Campos de la cabecera (`FormDraft`, `types.ts:129-141`) y su límite (`admin_returns.py:26-29`):
`physical_receipt_number` (50), `branch` (100), `return_kind` (`devolucion` | `reparacion` | `cambio`), `merchandise_for` (255),
`observations`, `transport` (255), `guide_number` (100), `comments`, `received_by_name` (255), `received_date` (AAAA-MM-DD).
Por sección: `invoice_number` (100), `customer_code` (100), `customer_name` (255), `phone` (50), `address`, `route_label` (100), `sellers`.

### 3.6 Imprimir

- **Imprimir** (solo con `export`) genera el documento con `formDocumentHtml` (`src/lib/devoluciones/formDocument.ts`) y lo abre en
  una ventana nueva con `window.open` + `print()` (`printFormDocument`). Si el navegador bloquea la ventana, muestra el aviso.
- Imprime **lo que hay en pantalla**, incluidos cambios sin guardar. Si el formulario aún no existe, el título es
  "Borrador (sin guardar)".
- Contenido: cabecera "Comprobante de devolución DEV-…", viaje y fecha, una sección por parada con su tabla de artículos,
  "Tipo" = motivos distintos de la parada (`reasonsOf`), observaciones, comentarios, fecha y recibido por, tres líneas de firma
  (**Recibió Bodega**, **V°B° Ventas**, **Retiro del Cliente**) y la nota de garantías. Todo se escapa con `escapeHtml`.

### 3.7 Viaje listo para liquidar

Un viaje queda listo cuando `total_returns > 0` y `pending_returns === 0` (`isReadyToSettle`, `trips.ts:37-38`).
Esa condición se ve en la insignia de la tarjeta y en la pestaña **Listos para liquidar**. Liquidaciones lee la misma
condición a través de `openReturnCounts` (§7). **Ojo:** el conteo `pending_returns` **no** coincide con el de Liquidaciones
(ver §7.3).

---

## 4. Frontend: archivos y lógica pura

### 4.1 Pantalla (`src/pages/devoluciones/`)

| Archivo | Responsabilidad |
|---|---|
| `page.tsx` | Página: encabezado, 4 `StatCard`, pestañas, rango de fechas, lista de `TripCard`. |
| `hooks/useReturnTrips.ts` | Carga en paralelo `getSummary()` y `listTrips({state, from, to})`. Recarga con `reload()`. **El resumen no recibe filtros** (ver §12). |
| `hooks/useTripDetail.ts` | Carga `getTrip(routeId)` solo cuando la tarjeta está abierta. |
| `api/devolucionesApi.ts` | Cliente HTTP. Base `/v1/devoluciones` (`:7`) sobre `apiFetch` de `src/lib/api-client`. Funciones: `getSummary`, `listTrips`, `getTrip`, `receiveReturn`, `receiveAll`, `createForm`, `getForm`, `updateForm`. Los errores del servidor llegan como `Error` con `error.message`. |
| `parts/TripCard.tsx` | Tarjeta de viaje: progreso, detalle, selección, formularios, recepción, formulario modal. |
| `parts/ReturnLinesTable.tsx` | Tabla de líneas agrupada por parada. |
| `components/ReceiveModal.tsx` | Diálogo de recepción (una línea o todas). |
| `components/ReturnFormModal.tsx` | Formulario de devolución (nuevo o guardado), guardar e imprimir. |

### 4.2 Lógica pura (`src/lib/devoluciones/`, sin React)

| Archivo | Contenido |
|---|---|
| `types.ts` | Tipos: `ReturnStatus` (`pending`, `approved`, `received`, `completed`, `rejected`, `cancelled`), `ReturnCondition`, `ReturnKind`, `ReturnTrip`, `ReturnLine`, `FormSection`, `ReturnForm`, `FormView`, `TripDetail`, `FormDraft`, `SectionDraft`, `TripFilter`. |
| `trips.ts` | Ver tabla de funciones abajo. |
| `formDocument.ts` | Documento HTML imprimible y `printFormDocument`. |
| `trips.test.ts` | Pruebas vitest de la lógica (estados, progreso, agrupación, borrador, recepción, documento, selección). |

Funciones de `trips.ts` (líneas según el archivo):

| Función | Línea | Qué hace |
|---|---|---|
| `CONDITIONS` | 7 | `['Bueno','Dañado','Incompleto']`. |
| `KIND_LABELS` | 8 | Devolución / Reparación / Cambio. |
| `STATUS_LABELS`, `statusLabel`, `statusVariant` | 10-25 | Texto e insignia por estado. Un estado desconocido se muestra tal cual. |
| `returnTypeLabel` | 30 | `contracamion` → Contracamión, `recolecta` → Recolecta, `devolucion` → Devolución; lo demás tal cual. |
| `OPEN_STATUSES`, `isOpen` | 33-34 | `pending` y `approved` ("abiertas"). **Las mismas que usa el bloqueo de Liquidaciones.** |
| `isReadyToSettle` | 37-38 | `total_returns > 0 && pending_returns === 0`. |
| `tripProgress` | 40-44 | Etiqueta `hechas/total` y porcentaje, con tope y sin dividir por cero. |
| `formatRouteDate` | 47-50 | Recorta la fecha a `AAAA-MM-DD` (la API puede mandar hora). |
| `groupBySection` | 58-75 | Agrupa líneas por `dispatch_guide_id`, en orden de recorrido; una línea sin sección se muestra igual. |
| `draftFromDetail` | 93-108 | Borrador del formulario: lo guardado manda, lo que falta se prellena con tracking. |
| `toFormPayload` | 111-124 | Recorta espacios antes del `PUT`/`POST`. |
| `reasonsOf` | 127 | Motivos distintos de una parada, separados por "; ". |
| `receivedQuantity` | 129-130 | Cantidad recibida si está `received` o `completed`; si no, `null`. |
| `defaultReceiveQuantity` | 133 | Cantidad inicial del diálogo: la registrada por el chofer. |
| `parseQuantity` | 136-141 | Entero ≥ 0 o `null`. |
| `isSelectable` | 146 | `form_id === null`. |
| `toggleSelection`, `toggleGroup`, `pruneSelection` | 149-172 | Selección sin mutar el conjunto original. `pruneSelection` descarta lo que ya no es seleccionable tras recargar. |
| `newFormView` | 175-185 | Arma el formulario nuevo con solo las marcadas y las paradas que las tienen. |

---

## 5. Backend

Código: `backend/admin/src/admin_returns.py` (lógica), `admin_returns_sql.py` (SQL), `admin_media.py` (fotos).
Registro de rutas: `backend/admin/src/app.py:33-40`. Definición de API Gateway: `backend/admin/template.yaml:299-385`.
Todas las rutas usan el autorizador JWT del stack común (`CUSTOM` + `JwtAuthorizerId`).

### 5.1 Endpoints

| Método y ruta | Acción de permiso | Filtro por país (rol) | Qué hace | Errores propios |
|---|---|---|---|---|
| `GET /api/v1/devoluciones/resumen` | `view` | sí (`vw_return_trips.country_id`) | Contadores de viajes y devoluciones. **Sin filtro de fecha ni de pestaña.** (`admin_returns.py:88-91`) | — |
| `GET /api/v1/devoluciones/viajes?estado=&desde=&hasta=` | `view` | sí | Lista de viajes con devoluciones. `estado` ∈ `pendientes`/`recibidos`/`todos` (por defecto `todos`). Máximo 500. (`:94-111`) | 400 si `estado` o fecha inválidos |
| `GET /api/v1/devoluciones/viajes/{routeId}` | `view` | sí (404 fuera de país) | Devoluciones del viaje (con foto **firmada**), secciones (borrador), formularios del viaje y `defaults.transport`. (`:114-127`) | 404 si no existe o no es del país |
| `POST /api/v1/devoluciones/viajes/{routeId}/recibir-todas` | `edit` | sí (vía `_trip`) | Recibe todas las abiertas del viaje. (`:188-196`) | 404; `condition` inválida → 400 |
| `POST /api/v1/devoluciones/{returnId}/recibir` | `edit` | sí (`tbl_stores.country_id`) | Recibe una devolución. (`:163-185`) | 404; 400 cantidad/estado; 409 (ver §5.5) |
| `POST /api/v1/devoluciones/viajes/{routeId}/formularios` | `edit` | sí (vía `_trip`) | Crea un formulario con las devoluciones de `return_ids`. (`:243-274`) | 400 y 409 (ver §5.5) |
| `GET /api/v1/devoluciones/formularios/{formId}` | `view` | sí (vía `_trip` del formulario) | Formulario, sus devoluciones y secciones. **No firma la foto** (`:130-139`, ver §12). | 404 |
| `PUT /api/v1/devoluciones/formularios/{formId}` | `edit` | sí (vía `_trip`) | Actualiza cabecera y secciones; no cambia devoluciones. (`:277-294`) | 404; 400 validaciones |

Ruta de la lectura del formulario: `GET /formularios/{id}` y la de creación `POST /viajes/{id}/formularios` (`app.py:33-40`).

### 5.2 Permisos y país

- `_caller(event, action)` (`admin_returns.py:36-42`) exige el permiso con `caller.require('devoluciones', action)` (403 si falta)
  y carga la organización del usuario (401 si no existe `app_user`).
- **Acciones:** `view` para leer; `edit` para recibir y para crear/editar formularios. **`export` no lo comprueba el backend**: solo
  lo usa la pantalla para mostrar "Imprimir".
- **País:** `_scope` (`admin_returns.py:45-50`) usa `caller.country_filter` (`tms_common/permissions.py:49-52`): `None` = todos los
  países; tupla = solo esos. Un administrador ve todo. Un rol con países acotados recibe 404 en lo que no es suyo, nunca datos ajenos.
- La organización se toma siempre del usuario autenticado, nunca del cuerpo de la petición.
- Rol seed: `Devoluciones`, con `view`, `edit` y `export` sobre `devoluciones` (`sql/60_devoluciones_recepcion.sql` sección 4).

### 5.3 Transiciones de estado de `tbl_returns`

| Desde | Hacia | Quién lo hace | Dónde |
|---|---|---|---|
| (sin escribir por el módulo) | `pending` (por defecto de lectura) | app del chofer | `mobile/.../sql.py:324-329`, ver §6.3 |
| `pending` | `received` | `recibir`, `recibir-todas` | `RECEIVE_SQL` / `RECEIVE_ALL_SQL` (`admin_returns_sql.py:165-182`) |
| `approved` | `received` | ídem | ídem |
| `received` | `received` | `recibir` otra vez | **idempotente**: responde 200 con `return: null` y no pisa quién ni cuándo (`admin_returns.py:174-175`) |
| `rejected`, `cancelled`, `completed` | — | `recibir` responde **409** | `admin_returns.py:176-177` |

Notas:
- El módulo **no escribe** `approved`, `rejected`, `cancelled` ni `completed`. Ningún código de este repo produce esos estados en el
  flujo normal (búsqueda hecha en `backend/admin`, `backend/mobile`, `src/pages/devoluciones` y `src/lib/devoluciones`). Los datos mock
  sí los usan (§11). Las únicas escrituras de `tbl_returns` en el repo son `mobile/.../sql.py:325` (INSERT sin `status`, `'contracamion'`) y `admin_returns_sql.py:166` y `:175` (ponen `received`). Cómo llegan a la BD en producción: **no verificado**.
- `RECEIVE_SQL` (`admin_returns_sql.py:165-171`) filtra `COALESCE(status,'pending') IN ('pending','approved')` en el propio `UPDATE`.
  Si otra persona cambió el estado entre la lectura y la escritura, no actualiza nada y el servidor responde **409**
  "La devolución cambió de estado; recarga" (`admin_returns.py:180-181`).

### 5.4 Condiciones de la mercadería (Bueno / Dañado / Incompleto)

- Se validan en el servidor contra `CONDITIONS = ("Bueno", "Dañado", "Incompleto")` (`admin_returns.py:21`, `:156-160`). Por defecto `Bueno`.
- Se guardan en `tbl_returns.received_condition` (varchar 50) y se muestran en el formulario y el documento impreso.
- **No cambian el estado** ni bloquean nada: una devolución `Dañado` queda `received` igual que una `Bueno`. En el código de la
  aplicación, solo la pantalla y el documento impreso la muestran; Liquidaciones y el gate no la leen (búsqueda por `received_condition`
  en `src/`, `backend/`, `scripts/`). Único uso fuera de la pantalla: el generador de la mock deriva el destino de la mercadería
  (`Destrucción` si está `Dañado`, `scripts/mock-tarifas/flujo.ts:196`), que es dato de prueba y no lógica de producción.

### 5.5 Idempotencia, validaciones y 409

| Caso | Respuesta | Código |
|---|---|---|
| Recibir una devolución ya recibida | 200, `return: null` (sin cambios) | `admin_returns.py:174-175` |
| Recibir una `rejected`/`cancelled`/`completed` | 409 | `:176-177` |
| Cantidad recibida no es entero ≥ 0 (o es `null`) | 400 | `:171-173` |
| Recibir todas sin pendientes | 200 con `received: 0` | `:188-196` |
| `return_ids` vacío o no lista | 400 "Marca al menos una devolución…" | `:233-236` |
| Más de 500 devoluciones en un formulario | 400 | `:238-239` |
| Alguna devolución no es de ese viaje | 400 | `:249-251` |
| Alguna devolución ya va en otro formulario | **409** "ya van en otro formulario; desmárcalas" | `:252-254` |
| Sección de una parada que no tiene devoluciones del formulario | 400 | `:207-208` |
| Campo de texto demasiado largo | 400 | `:61-65` |
| `return_kind` fuera de `devolucion/reparacion/cambio` | 400 | `:218-219` |
| No se pudo asignar número de formulario tras 3 intentos | 409 | `:265-266` |
| Carrera al insertar la misma devolución en dos formularios | 409 (la restricción única de `tbl_return_form_items` falla dentro de la transacción) | `:268-269`, `sql/62` |

**Idempotencia de la creación de formularios:** **no es idempotente**. Cada `POST` crea un formulario nuevo si las devoluciones
siguen libres. La protección contra doble clic está en la pantalla: el botón **Guardar** se deshabilita mientras guarda
(`ReturnFormModal.tsx:149`) y, tras guardar, la modal pasa a modo *editar* (`PUT`), no a crear otro.

**Transacción de creación:** número de formulario, cabecera, ítems y secciones van en **una** transacción `pg.transaction()`
(`admin_returns.py:258-274`). La bitácora (`audit.record`) se escribe después del commit.

### 5.6 Numeración `DEV-AAAA-MM-####`

- `_next_form_number` (`admin_returns.py:227-230`): prefijo `DEV-AAAA-MM-` con el **mes en UTC**, y número = máximo existente de esa
  organización con ese prefijo + 1, con cuatro dígitos (`NEXT_FORM_NUMBER_SQL`, `admin_returns_sql.py:121-124`).
- Unicidad: `uq_return_form_number (organization_id, form_number)` (`sql/60`). Si dos personas calculan el mismo número, el
  `INSERT … ON CONFLICT DO NOTHING` no devuelve fila y se reintenta (hasta 3 veces, `FORM_NUMBER_ATTEMPTS`).
- El número no se reutiliza ni se reinicia al cambiar de mes en la zona local (el mes es UTC).

### 5.7 Migraciones

| Archivo | Qué hace |
|---|---|
| `sql/60_devoluciones_recepcion.sql` | Agrega a `tbl_returns`: `received_at`, `received_by` (FK a `tbl_app_users`), `received_quantity` (≥ 0), `received_condition`. Crea el `CHECK ck_return_status` (sin `completed`) e índice `idx_return_dispatch_guide_status`. Crea `tbl_return_forms` (con `uq_return_form_route`, que la 62 quita), `tbl_return_form_sections` (única por formulario y parada), la vista `vw_return_trips` y el rol **Devoluciones** con sus permisos. Concede a `tms_app` si existe. Rollback: `sql/60_devoluciones_recepcion_rollback.sql` (copia lo capturado a tablas `_bak` antes de quitar columnas). |
| `sql/61_devoluciones_estado_completed.sql` | Recrea `ck_return_status` admitiendo `completed` (estado terminal, no bloquea). Rollback: `sql/61_…_rollback.sql`. |
| `sql/62_devoluciones_formularios_por_seleccion.sql` | Crea `tbl_return_form_items (form_id, return_id)` con `pk_return_form_item` y **`uq_return_form_item_return` (unique return_id)**: una devolución en **un solo** formulario. Rellena ítems para formularios existentes (todas las devoluciones de su viaje). Quita `uq_return_form_route`: varios formularios por viaje. **Recrea `vw_return_trips`** sin `form_id` y con `forms_count`. Rollback: `sql/62_…_rollback.sql`. |

Cada migración es idempotente, va dentro de `begin/commit` y se aplica con `scripts/run-migration.mjs` (indicado en el encabezado de cada archivo).
La tabla `tbl_returns` **no tiene su DDL en `sql/`** de este repo; `sql/60` es la primera migración que la altera aquí (origen: **no verificado**).

**`vw_return_trips`** (versión vigente, `sql/62`): una fila por viaje con devoluciones. Columnas: `route_id`, `organization_id`,
`route_number`, `route_date`, `plan_trip_id`, `route_status`, `driver_id`, `driver_name`, `carrier_id`, `carrier_name`, `country_id`
(de `tbl_stores`), `total_returns`, `received_returns` (`status='received'`), `pending_returns`
(**`status NOT IN ('received','rejected','cancelled')`**, incluye `completed`), `last_return_at` (`max(return_date)`), `forms_count`.

### 5.8 Bitácora

Cada escritura del módulo llama `audit.record` (`admin_returns.py:183, 194, 272, 292`): `recibir` / `recibir-todas` (sobre `tbl_returns` o
`tbl_routes`), `create` y `update` de formularios (sobre `tbl_return_forms`), con metadatos de cantidad y número.

---

## 6. Origen de los datos: la app del chofer (contracamión)

Código del servidor: `backend/mobile/src/mobile_api/`. Código de la app: repo hermano `C:\Users\dsosa\Documents\Dylan\OLO\PROYECTO_TMS\mobile`
(solo lectura), carpeta `frontend/src/`.

### 6.1 Endpoints de la app (`backend/mobile/src/mobile_api/routes.py:32-35`)

| Ruta | Función | Qué hace |
|---|---|---|
| `GET /paradas/{id}/articulos` | `stops.list_items` (`stops.py:181-190`) | Artículos del pedido de la parada (`tbl_order_items`, `ORDER_ITEMS_SQL`, `sql.py:339-345`). Exige viaje **activo** (409 si no). |
| `POST /paradas/{id}/devoluciones` | `stops.add_return` (`stops.py:193-238`) | Registra la devolución. |
| `POST /paradas/{id}/evidencias/upload-url` | `evidence.upload_url` (`evidence.py:53-69`) | Firma la subida de la foto. |
| `POST /paradas/{id}/evidencias` | `evidence.confirm` (`evidence.py:72-100`) | Confirma la foto subida y la registra en `tbl_tracking_evidences`. |

### 6.2 Qué guarda `add_return`

- **Motivo obligatorio** (`stops.py:198-200`). **Artículos** entre 1 y 50 (`logic.py:46`, `MAX_RETURN_ITEMS`); cada uno con
  `quantity` entero entre 1 y 100 000 y producto (nombre o código) (`return_items`, `stops.py:157-178`). Se acepta **escribir artículos a mano**
  (sin `product_code`): ver `pendientes/03`.
- Una **fila de `tbl_returns` por artículo** (`INSERT_RETURN_SQL`, `sql.py:324-329`) con `return_type='contracamion'`
  (literal en el SQL; `logic.RETURN_TYPE` en `logic.py:45` es la misma constante), `reason`, `product_code`, `product_name`,
  `quantity`, `photo_url`, `notes`, `organization_id`, `dispatch_guide_id`, `order_id`.
- `return_number`: `DV-<client_id>` (o `DV-<client_id>-n` si vienen varios artículos). `ON CONFLICT (organization_id, return_number) DO NOTHING`:
  **reenviar la misma devolución no la duplica** (`stops.py:220-222`, `sql.py:327-328`).
- Si se creó algo (no es duplicado), un evento `return` en `tbl_tracking_events` con estado `warning` y nota
  `Devolución: <cant> x <producto> (<motivo>)` (`stops.py:234`, `sql.py:309-314`).
- Respuesta: `return_id`, `return_ids`, `duplicate`. Código 201 si se creó, 200 si ya existía.
- La transacción es única (`db.run_in_transaction`, `stops.py:224-237`).
- Exige viaje **activo**: 409 "El viaje no está en tránsito." (`stops.py:206-207`).

### 6.3 Estado inicial

`INSERT_RETURN_SQL` **no escribe `status`**: la fila queda con el valor por defecto de la columna. El repo no declara ese default (no hay DDL de `tbl_returns` en `sql/`, §5.7)
(**no verificado**). Las lecturas del módulo tratan `NULL` como `pending` (`COALESCE(status,'pending')`). Igual pasa con `return_date`: no se escribe,
y `last_return_at` puede quedar vacío (**no verificado** si la columna tiene default).

### 6.4 La foto: flujo completo

**Cliente (app).** `queueReturn` (`frontend/src/sync/outbox.ts:73-93`):
1. Si hay foto, genera un `photo_client_id` (UUID) y encola una evidencia `kind: 'photo_return'`, `mime: image/jpeg`
   (`queueEvidence`, `outbox.ts:95-110`).
2. Encola la devolución con `items`, `reason`, `notes`, `photo_client_id` y un `client_id` propio.
3. Cada elemento del outbox guarda `depends_on` = el elemento pendiente anterior (`outbox.ts:39`). Por eso la devolución espera a que
   su foto se suba. Si la foto falla de forma definitiva, la devolución pasa a `failed` con `depends_failed` (`outbox.ts:173-180`).
4. Subida de la evidencia (`sync/evidence.ts`, en 3 pasos): `upload-url` → subida directa a S3 → confirmación.

**Servidor.**
1. `upload-url` (`evidence.py:53-69`): valida `kind`/`mime` (`logic.require_evidence_request`), arma la llave con
   `logic.new_evidence_key` y devuelve URL y campos firmados. Llave:
   **`pedidos/<número de pedido>/<id del pedido>/photo_return-<client_id>.jpg`** (`logic.py:340-345`). El número se limpia con
   `key_segment` (`logic.py:323-331`). Con `client_id` la llave es siempre la misma: reintentar sobrescribe, no deja huérfanos.
2. `confirm` (`evidence.py:72-100`): comprueba que el objeto exista en S3 (`HEAD`), tamaño ≤ 5 MB (`logic.MAX_EVIDENCE_BYTES`) y la
   llave con su patrón (`logic.require_evidence_key`, `logic.py:359-366`). Inserta en `tbl_tracking_evidences` con `kind='photo_return'`.
   **No** actualiza `photo_url` de la guía (solo lo hace para `photo_invoice`, `photo_product` y `signature`, `evidence.py:92-95`).
3. `add_return` con `photo_client_id` (`stops.py:211-218`): busca en `tbl_tracking_evidences` la llave de esa evidencia
   (`RETURN_PHOTO_SQL`, `sql.py:333-336`) y la guarda en `tbl_returns.photo_url`. **Guarda la llave S3, no una URL.**
   Si la evidencia aún no está confirmada, responde 400 "La foto de la devolución aún no se confirmó".
4. Una devolución **sin foto** también se acepta en el servidor (la foto es opcional allí); la app la exige (`canSubmit`, `lib/return-form.ts:42-44`).

### 6.5 Cómo se firma la foto para verla (Devoluciones)

- `admin_media.signed_photo_url` (`backend/admin/src/admin_media.py`):
  - Usa el bucket de la variable de entorno **`MOBILE_EVIDENCE_BUCKET`** (`template.yaml:58`, parámetro `MobileEvidenceBucket`, **por defecto vacío**, `template.yaml:19-22`).
  - Valida la llave con `^pedidos/[A-Za-z0-9_.-]+/[0-9a-f-]{36}/[a-z_]+-[0-9a-f-]{36}\.(jpg|png)$` (`admin_media.py:11`). Una llave ajena al patrón no se firma.
  - Firma GET con validez de **3600 s** (`SIGNED_GET_TTL_SECONDS`, `:10`), región `AWS_REGION` (por defecto `us-east-2`).
  - Ante cualquier fallo (sin bucket, llave inválida, S3 caído) devuelve `None` y registra un aviso: la pantalla sigue cargando,
    solo no muestra "Ver foto".
- Se firma en `GET /viajes/{routeId}` (`admin_returns.py:122`), no en la lista ni en el formulario (§12).
- El rol Lambda necesita `s3:GetObject` sobre `pedidos/*` del bucket de evidencias (`pendientes/01`). En el repo ese permiso aparece solo en `backend/tracking/template.yaml:121-122` (condicionado a `HasMobileEvidenceBucket`); `backend/common-services` no lo concede. Si ya está concedido al rol compartido en AWS: **no verificado**.

### 6.6 Relación con la foto en el repo de la app

El repo hermano define `photo_return` en `frontend/src/sync/evidence.ts` (tipo `EvidenceKind`). Los motivos que envía la app son fijos y en español
(`frontend/src/lib/return-form.ts:5-11`): *Producto dañado*, *No era lo pedido*, *Cliente rechazó el producto*, *Cantidad de más*, o texto libre con «Otro».
La pantalla del chofer del botón de devolución es `frontend/src/components/return-button.tsx`.

---

## 7. Relación con LIQUIDACIONES (la más importante)

### 7.1 Qué bloquea

- **Estados que bloquean:** `pending` y `approved`. El conjunto es `OPEN_STATUSES` (`src/lib/devoluciones/trips.ts:33`), y
  `src/lib/tarifas/trips/queryHelpers.ts:4` lo **importa de Devoluciones**. `received`, `rejected` y `cancelled` no bloquean;
  `completed` tampoco (ver §7.3).
- Un viaje con **cero** devoluciones nunca se bloquea.

### 7.2 Backend: `backend/tarifas/src/returns_gate.py`

- **Flag** `TMS_RETURNS_GATE` (`returns_gate.py:28-29`): `on`, `1`, `true` o `yes` lo activan. **Sin la variable, el valor por defecto
  es `off`** (no bloquea). En `backend/tarifas/template.yaml:63` está en `'on'`, con un comentario que obliga a desplegar `backend/admin`
  **antes** (`template.yaml:60-63`).
- **Qué mira:** `OPEN_RETURNS_SQL` (`returns_gate.py:20-25`) cuenta devoluciones `pending`/`approved` de las guías del viaje (`tbl_dispatch_guides.route_id`).
- **Dónde actúa:** `returns_gate.check` se llama **antes de cada `INSERT` en `tarifas_settlements`**:
  `app.py:228` (inserción simple), `app.py:271` (lote de `/tx`, función `_planned`) y `app.py:276` (`insert` dentro de `/tx`).
  Si algún viaje del lote tiene devoluciones abiertas → **409** con el mensaje
  "El viaje tiene N devolución(es) sin recibir: recíbelas en el módulo de Devoluciones antes de liquidarlo." (`returns_gate.py:41-42`).
- **Qué NO mira:** `UPDATE` de liquidaciones (anular, cambiar estado, reclamos). Un viaje ya liquidado que recibe una devolución nueva
  **sigue liquidado**; solo se frena si se intenta **re-liquidar** (que hace un `INSERT`). Así lo documenta también `returns_gate.py:4-5`.
- Pruebas: `backend/tests/test_returns_gate.py` (7 casos: flag apagado, bloqueo, liquidación con todo recibido, solo `pending`/`approved` del viaje, batch y tx).

### 7.3 Frontend de Liquidaciones

- `openReturnCounts` (`src/lib/tarifas/trips/queryHelpers.ts:74-87`) lee `tripReturn` (vista `tarifas_v_devoluciones`, que `db_names.py:70`
  traduce a `vw_tarifas_devoluciones`) filtrando por `OPEN_STATUSES`. Si la consulta falla, devuelve conteos vacíos y avisa en consola:
  **la pantalla no se cae y decide el servidor**.
- `notLiquidableReason` (`src/lib/tarifas/tripContext.ts:70-86`), en este orden: 1) viaje no completado; 2) ya tiene liquidación vigente;
  3) **devoluciones sin recibir** (`openReturns > 0`, mensaje de la pantalla); 4) sin transportista.
- `isLiquidable` (`tripContext.ts:65`) solo mira estado completado y sin liquidación vigente.

### 7.4 Inconsistencia conocida: qué cuenta "pendiente" en cada lado

| Lugar | Qué cuenta como "pendiente / abierta" | Código |
|---|---|---|
| Devoluciones: `pending_returns` de la vista, tarjetas, pestaña "Por recibir" y "Listos" | **Todo lo que no sea** `received`, `rejected` o `cancelled` → incluye `completed` | `sql/62` (`vw_return_trips`) |
| Devoluciones: `isOpen` / botón **Recibido** | solo `pending` y `approved` | `trips.ts:33-34`, `ReturnLinesTable.tsx:85` |
| Liquidaciones (frontend) y gate (backend) | solo `pending` y `approved` | `queryHelpers.ts:79`, `returns_gate.py:24` |

**Consecuencia real:** una devolución en `completed` **no bloquea** la liquidación, pero **sí** aparece como "por recibir" en Devoluciones.
Además no tiene salida desde la pantalla: el botón **Recibido** no aparece (no es `isOpen`), **Recibir todas** actualiza 0 filas
(`RECEIVE_ALL_SQL` solo toca `pending`/`approved`) y `recibir` responde 409. Así, el viaje queda con "N por recibir" sin forma de cerrarlo.
Hoy ningún código de este repo escribe `completed` (la pantalla anterior que lo hacía, `/devoluciones/legacy`, ya no existe: `sql/61` lo menciona).
**No verificado** si hay filas `completed` en la BD; si las hay, este es el caso.

Recomendación para cerrar la inconsistencia (no aplicada): hacer que `pending_returns` use la misma lista que `OPEN_STATUSES`, o
definir `completed` como cerrada en todos los lados (y ajustar el bloqueo). La decisión es de negocio y cambia lo que bloquea una liquidación.

### 7.5 Orden de despliegue

`backend/admin` (recepción) debe estar desplegado antes de activar `TMS_RETURNS_GATE=on` (`backend/tarifas/template.yaml:60-63`).
Si el gate se activa sin poder recibir, los viajes con devoluciones quedan sin liquidar y sin forma de desbloquearlos desde Devoluciones.
Las migraciones `sql/60` y `sql/62` deben estar aplicadas antes de desplegar `backend/admin`, porque su SQL usa las columnas `received_*`,
`tbl_return_form_items` y `forms_count`.

---

## 8. Relación con PLANIFICACIÓN (Bandeja)

- `backend/planning/src/bandeja.py` lista como **`pickup`** las devoluciones abiertas: `tbl_returns` con `COALESCE(status,'pending') IN ('pending','approved')`
  de la organización (`bandeja.py:24-35`). Usan los datos del pedido original (cliente, zona, dirección).
- En la pantalla de la Bandeja, `kind = 'pickup'` se muestra con la insignia **"Devolución"** (`src/pages/oms/bandeja/KindBadge.tsx:8-10`,
  `omsBandeja.kindReturn` en `src/i18n/local/es/omsBandeja.ts:31`) y el filtro "Pickup (devoluciones)" (`omsBandeja.ts:33`).
- **Precisión:** el texto del mock (`docs/tarifador/demo-data/MOCK_FLUJO_3_MODULOS.md:50`) dice que aparecen «como filas de recolección de devolución». En el código
  se llaman *pickup* y se rotulan *Devolución*. Lo que sí es cierto es que una devolución abierta **sale en la Bandeja para recogerla**;
  el concepto de *recolecta* (tipo `recolecta`) es otro (ver `pendientes/02`).
- Efecto: una devolución que todavía no se recibió puede planificarse como recogida, y una recibida sale de la Bandeja.
  En `backend/planning` solo `bandeja.py` consulta `tbl_returns` y ningún código de ese backend toma `kind = 'pickup'` para asignarlo a un viaje (`plan_stops`); si la asignación se hace por otra vía, **no verificado**.

---

## 9. Relación con TRACKING

- **Evento `return`:** al registrar la devolución el servidor escribe en `tbl_tracking_events` (`stops.py:234`, `sql.py:309-314`) con
  `event_type='return'`, `event_status='warning'` y nota con cantidades, producto y motivo. Ni `src/pages/tracking` ni `backend/tracking/src` tratan `event_type` `return` de forma especial (grep). Cómo se ve exactamente en el monitor: **no verificado** (render genérico de eventos no revisado).
- **Parada `collection`:** `dispatch_guides.stop_type = 'collection'` existe (`stops.py:56` acepta `delivery` o `collection`). La app
  pide foto de producto y firma para una recolecta (`logic.py:49`, `REQUIRED_EVIDENCE`). En la web, `src/pages/tracking/components/ParadaItem.tsx:9`
  pide `photo_product` y `signature` para una recolecta, con su icono (`:22-33`). Hoy **ninguna ruta crea una recolecta real** (solo el mock, §11).
- **La web de Tracking no muestra `photo_return`:**
  - `backend/tracking/src/tracking_sql.py:11` define `EVIDENCE_KINDS_SQL = ('photo_invoice', 'signature', 'photo_product')`, y la consulta de
    evidencias (`:151`) filtra por esa lista. La foto de devolución **se queda fuera**.
  - `src/pages/tracking/types.ts:9`: el tipo `EvidenceKind` no incluye `photo_return`.
  - `ParadaItem.tsx:8-9`: las etiquetas de evidencia solo cubren entrega y recolecta.
  - `backend/mobile/src/mobile_api/logic.py:44` tiene el comentario "la web no muestra photo_other (se rechaza allá)": el mismo criterio aplica a `photo_return`.
  - **Consecuencia:** la foto de la devolución se ve en Devoluciones (vía `tbl_returns.photo_url`), no en Tracking.
- La devolución **no** cambia el estado de la parada ni la guía (`add_return` no toca `tbl_dispatch_guides`).

---

## 10. Fotos de devolución: precauciones (hallazgo verificado)

### 10.1 La restricción de la BD compartida ya admite `photo_return` (m08 aplicada)

- `backend/mobile/sql/m08_photo_return.sql` amplía `ck_tracking_evidence_kind` con `'photo_return'`. Es **aditiva e idempotente** y **fue aplicada en Aurora `tms_olo`**: el 2026-11-06 se leyó la restricción real y lista `photo_return` (el 2026-11-05 aún no la admitía).
- Antes de aplicarla, `evidence.confirm` fallaba el `CHECK` y la devolución quedaba esperando en el outbox del chofer (`outbox.ts:39`, `:173-197`). Ya no ocurre en la BD; falta desplegar `backend/mobile` y `backend/admin` y dar el permiso S3 (`pendientes/01-despliegue-contracamion.md`).
- Rollback de `m08` (solo sin filas `photo_return`): en el encabezado del archivo.

### 10.2 Otras precauciones de la foto

- **Bucket vacío = sin "Ver foto"** sin error visible (`admin_media.py`). Hay que pasar `MobileEvidenceBucket` al desplegar `backend/admin`.
- **La URL firmada caduca a la hora** (3600 s). La tarjeta firma al abrir el viaje; si se deja abierta más de una hora, el enlace falla hasta recargar.
- **Lectura del formulario:** `GET /formularios/{id}` devuelve `photo_url` **como llave S3** (sin firmar) (`admin_returns.py:136`). La pantalla
  del formulario no muestra fotos, así que no se nota; si se agrega una foto allí, hay que firmarla.
- La foto es **opcional en el servidor** y **obligatoria en la app**. En el repo, la única escritura de `tbl_returns` es `add_return` (que acepta sin foto); la app lo impide con `canSubmit`. Una devolución sin foto solo llegaría llamando al endpoint directamente.

---

## 11. Datos de prueba (mock) y datos reales

### 11.1 Mock compartido (Liquidaciones + Devoluciones + Tracking)

Documento: `docs/tarifador/demo-data/MOCK_FLUJO_3_MODULOS.md`. Generadores: `scripts/mock-tarifas/generar.ts` (escenarios),
`scripts/mock-tarifas/flujo.ts` (tablas y formularios), `scripts/mock-tarifas/exportar.ts`, `scripts/mock-tarifas/cargar.mjs` (carga y `delPor` de `tbl_returns`, `cargar.mjs:178`).

**Usuarios:**

| Usuario | Rol | Dónde se crea | Notas |
|---|---|---|---|
| `devoluciones.mock@demo.tms.local` | Devoluciones, con alcance en los países MOCK | `scripts/mock-tarifas/flujo.ts` (`addUser('devoluciones', …)`) | Es el de la mock |
| `demo.devoluciones@demo.tms.local` | Devoluciones, alcance global (`country_id` NULL) | `scripts/demo-usuario-devoluciones.py:32-56` | **Otro usuario distinto.** El script solo borra su propio correo |
| `chofer.mock-1@…`, `chofer.mock-2@…` | Chofer | `flujo.ts` | La app del chofer |

La contraseña no va en el repo: se pone con `MOCK_USER_PASSWORD` (`MOCK_FLUJO_3_MODULOS.md:15-17`).

**Escenarios A–H** (de `MOCK_FLUJO_3_MODULOS.md:21-30`):

| # | Viaje | Devoluciones (mock) | Qué se ve en Devoluciones | Liquidaciones |
|---|---|---|---|---|
| A | `R-20260925-16-02` (TRANSOSA) | 2 `pending` | "2 por recibir" | **bloqueado** |
| B | `R-20261006-09-05` (ACUÑA) | 1 `pending` + 1 `approved` | "2 por recibir" | bloqueado |
| C | `R-20260916-04-01` (flota propia) | 2 `received` (Bueno / Incompleto) + formulario | "Listo para liquidar" | por liquidar o ya liquidado |
| D | `R-20260922-08-06` (TRANSOSA) | 1 `received` Dañado + formulario | listo | liquidable |
| E | `R-20260914-02-06`, `R-20260905-08-06` | `received`, con la factura que declara la liquidación (`FAC-88231`, `FAC-90017`) | listo | ya liquidados con devoluciones informadas |
| F | `R-20261009-06-05` (CR) y `VE-20261008-ZUL-17` (VE) | 1 `pending` registrada por el chofer (en ruta) | "por recibir" | no aparece (no completado) |
| G | `VE-20260916-CAR-11` (ANDINA-VE) | 1 `pending` + 1 **recolecta** `approved` (parada `collection`) | insignia "Recolecta" | bloqueado |
| H | `R-20260912-09-05` (ACUÑA) | 1 `rejected` + 1 `received` | la rechazada no cuenta como pendiente | liquidable |

Guion de punta a punta: `MOCK_FLUJO_3_MODULOS.md:34-38`.

**Valores válidos en la mock** (`generar.ts`):
- Tipos (`return_type`): `contracamion` (por defecto, `generar.ts:254`) y `recolecta` (solo escenario G).
- Estados: `pending`, `approved`, `received`, `rejected`. **No hay `completed`.**
- Condiciones: `Bueno`, `Incompleto`, `Dañado`.
- Motivos: lista `MOTIVOS` de `generar.ts` (p. ej. "Producto dañado en tránsito", "Cliente rechazó la entrega").
- Número de devolución: `MOCK-DEV-<número de viaje sin signos>-<n>`. Cantidad: `n + 1`. Productos: códigos `7501055`…`7504120`.
- Foto: siempre `null` (`flujo.ts`, `photo_url: null`). **No hay fotos reales en la mock.**

**Formularios:** `DEV-2026-10-9001` a `DEV-2026-10-9005` (`flujo.ts:195`), uno por viaje con devoluciones recibidas. Número de recibo físico
`RR-70xx`, sucursal `Bodega Central MOCK`, recibido por `Receptor de devoluciones MOCK`. La mock indica que están "fuera del rango real" (mes de
octubre, mientras el número siguiente en noviembre sería `DEV-2026-11-0001`).

**Pedidos de las paradas:** `tbl_order_items` (336 líneas, `MOCK_FLUJO_3_MODULOS.md:43`) para que `GET /paradas/{id}/articulos` ofrezca artículos
reales, incluido el producto de cada devolución mock.

**Límites declarados por la propia mock** (`MOCK_FLUJO_3_MODULOS.md:47-51`): fotos bloqueadas hasta aplicar `m08` (§10), sin archivos
reales en S3, las devoluciones abiertas aparecen en la Bandeja, y **el módulo no filtra por el selector de país** (§12).

### 11.2 Datos demo que no están en el repo

- `DEV-2026-11-0001` y `DEV-2026-11-0002`: el encargo indica que existen en Aurora. En el repo solo aparece como **fixture de pruebas**
  (`backend/tests/test_returns.py:122-124, :277-279`, `src/lib/devoluciones/trips.test.ts:149`). Su existencia en la BD: **no verificada** (sin consulta a la BD).
- `DV-DEMO-LIQ-1`: **no aparece en el repo**. Su existencia en Aurora: **no verificada**.
- `scripts/seed-recolecta-demo.mjs` crea viajes `VJ-DEMO-REC-*` con una parada `collection` (2 entregas y 1 recolecta). Según su encabezado,
  **no crea una devolución**; solo la parada. Se borra con `--clean`.

---

## 12. Observaciones, precauciones y limitaciones

1. **No filtra por el selector de país de la barra superior.** `page.tsx` no usa `CountryScopeBar` (el componente sí existe en
   `src/components/feature/CountryScopeBar.tsx` y lo usan Liquidaciones, Proformas y otros). Quien filtra es el **alcance de país del rol**
   en el servidor (`_scope`, `admin_returns.py:45-50`). Un usuario con todos los países ve **todos** los viajes, sin importar lo que elija arriba.
2. **Las 4 tarjetas no respetan pestaña ni fechas.** `summary()` no recibe parámetros (`admin_returns.py:88-91`) y `useReturnTrips`
   lo pide sin filtros. Son totales del alcance del usuario, no del periodo que se ve.
3. **`completed` vs el gate.** Ver §7.4: una devolución `completed` cuenta como "por recibir" sin salida desde la pantalla y **no** bloquea la liquidación.
4. **Formulario único por devolución.** `uq_return_form_item_return` (`sql/62`): una devolución solo puede estar en un formulario. Para cambiarla hay que
   crear otro formulario y no hay acción de "quitar del formulario". Si el formulario estaba mal, hay que corregirlo en el propio formulario (cabecera y secciones),
   no en sus líneas.
5. **Cantidad en "Recibir todas" = la registrada por el chofer.** No se puede corregir al recibir en bloque; hay que recibir línea por línea.
6. **Idempotencia asimétrica.** Recibir es idempotente (una segunda vez no cambia quién ni cuándo). Crear formulario no lo es (cada `POST` nuevo crea uno). La protección es el botón deshabilitado durante el guardado.
7. **Recibir una devolución ya recibida responde 200 con `return: null`.** La pantalla recarga igual, así que el usuario no ve error (comportamiento deliberado, prueba `test_receiving_twice_does_not_overwrite_who_and_when`).
8. **Recibir la cantidad de una devolución sin cantidad registrada.** Si `quantity` es `NULL`, el servidor exige `received_quantity` explícito (`admin_returns.py:171-173`); la pantalla lo precarga en 0.
9. **Lista limitada a 500 viajes** (`admin_returns_sql.py:21`). Sin aviso en pantalla: si hay más, se ven los más recientes por fecha y número. Conviene acotar con fechas.
10. **Estados sin productor en el código.** `approved`, `rejected`, `cancelled` y `completed` no los escribe ninguna ruta del módulo. Si
    aparecen en la BD, llegaron por otra vía (no verificada). Para `rejected`/`cancelled` la pantalla no ofrece ninguna acción.
11. **Recolecta sin origen.** La etiqueta existe; no hay alta, ni viaje, ni parada real (ver `pendientes/02`). La pestaña y la tabla la muestran igual.
12. **Lo que escribe la pantalla en la bitácora:** recibir, recibir todas, crear y editar formularios. No hay bitácora de la lectura.
13. **Permiso `export` solo en la pantalla.** Quien tenga `export` pero no `edit` puede imprimir; el backend no lo distingue.
14. **Zona horaria:** la fecha de recepción (`received_at`) es `now()` de la BD; el número de formulario usa el mes UTC; la fecha del viaje se
    recorta a `AAAA-MM-DD` en el frontend.
15. **Sin cambios en tiempo real.** Otra persona no ve una recepción hasta recargar (no hay *polling*). El 409 de carrera sí protege el dato.
16. **Foto sin bucket:** la tarjeta muestra "Ver foto" solo si el servidor firmó la URL; si no hay bucket configurado, no hay enlace ni aviso en pantalla.
17. **Pruebas de componentes y e2e:** no hay vitest de componentes para `src/pages/devoluciones` ni e2e de este módulo (`pendientes/05`).

---

## 13. Pendientes (no se duplican aquí)

Carpeta: [`docs/devoluciones/pendientes/`](./pendientes/README.md). Regla del equipo: [`.claude/rules/pendientes-por-modulo.md`](../../.claude/rules/pendientes-por-modulo.md).

| # | Pendiente | Estado |
|---|---|---|
| 01 | [Desplegar y dar permiso S3 al módulo (m08 ya aplicada)](./pendientes/01-despliegue-contracamion.md) | Pendiente por verificar |
| 02 | [Flujo «recolecta» (Atención al Cliente → viaje)](./pendientes/02-flujo-recolecta.md) | Pendiente por implementar (bloqueado: cuadrar con Planificación) |
| 03 | [Validar cantidad devuelta contra el pedido](./pendientes/03-validar-cantidad-contra-pedido.md) | Pendiente por implementar |
| 04 | [Formulario impreso: mostrar origen y foto](./pendientes/04-formulario-impreso-origen.md) | Idea |
| 05 | [Pruebas de punta a punta de contracamión](./pendientes/05-pruebas-e2e-contracamion.md) | Pendiente por verificar |

Relacionado en otro módulo: `docs/tracking/pendientes/09-app-devolucion-contracamion.md`.

---

## 14. Pruebas existentes

| Qué | Dónde | Cubre |
|---|---|---|
| Lógica pura | `src/lib/devoluciones/trips.test.ts` | Estados, listo para liquidar, progreso, fechas, agrupación, borrador, payload, recepción, documento imprimible (escape), selección, `returnTypeLabel`. |
| API de recepción y formularios | `backend/tests/test_returns.py` | Permisos de lectura y escritura, filtro por país, detalle con foto firmada, recepción (cantidad, idempotencia, 409, 404), recibir todas, creación de formularios (marcadas, número, ya tomadas, validaciones), edición y lectura. |
| Bloqueo de liquidación | `backend/tests/test_returns_gate.py` | Flag apagado, bloqueo, solo `pending`/`approved` del viaje, `insert_many` y `tx`. |
| Liquidaciones (frontend) | `src/lib/tarifas/__tests__/devolucionesSinRecibir.test.ts`, `src/pages/liquidaciones/__tests__/useTripReturnsPreload.test.ts` | Mensaje y conteo de devoluciones sin recibir. |
| App del chofer | `backend/mobile/tests/test_driver_api.py` (pytest) y pruebas de la app (repo `mobile`) | Registro de devoluciones y foto. |
| Integración | No hay e2e de Devoluciones (`pendientes/05`). | — |

Verificación: `tsc` sin errores según el pendiente 05 (no se re-ejecutó aquí).

---

## 15. Mapa de archivos

| Tema | Archivo |
|---|---|
| Ruta y menú | `src/router/config.tsx:131-132`, `src/components/feature/sidebar-nav-items.ts:93` |
| Página y estado | `src/pages/devoluciones/page.tsx`, `hooks/useReturnTrips.ts`, `hooks/useTripDetail.ts` |
| Componentes | `src/pages/devoluciones/parts/TripCard.tsx`, `parts/ReturnLinesTable.tsx`, `components/ReceiveModal.tsx`, `components/ReturnFormModal.tsx` |
| Cliente API | `src/pages/devoluciones/api/devolucionesApi.ts` |
| Lógica pura y tipos | `src/lib/devoluciones/trips.ts`, `types.ts`, `formDocument.ts`, `trips.test.ts` |
| Permisos en pantalla | `src/hooks/use-module-permissions.ts` |
| Backend: API | `backend/admin/src/admin_returns.py`, `backend/admin/src/admin_returns_sql.py`, `backend/admin/src/admin_media.py`, `backend/admin/src/app.py:33-40`, `backend/admin/template.yaml:19-22, 58, 299-385` |
| Backend: permisos | `backend/common-services/layers/tms_common/tms_common/permissions.py:43-53` |
| Backend: liquidación | `backend/tarifas/src/returns_gate.py`, `backend/tarifas/src/app.py:228, 271, 276`, `backend/tarifas/template.yaml:60-63` |
| Backend: planificación | `backend/planning/src/bandeja.py:24-35` |
| Backend: app del chofer | `backend/mobile/src/mobile_api/stops.py:157-238`, `sql.py:309-345`, `logic.py:44-49, 323-366`, `evidence.py:53-100`, `routes.py:32-35`, `backend/mobile/sql/m08_photo_return.sql` |
| Backend: tracking | `backend/tracking/src/tracking_sql.py:11, 151` |
| BD | `sql/60_devoluciones_recepcion.sql` (+ rollback), `sql/61_devoluciones_estado_completed.sql` (+ rollback), `sql/62_devoluciones_formularios_por_seleccion.sql` (+ rollback); `sql/59` renombra vistas; `sql/15_matriz_permisos_roles.sql:27` (menú) |
| Liquidaciones (frontend) | `src/lib/tarifas/trips/queryHelpers.ts:4, 74-87`, `src/lib/tarifas/tripContext.ts:65-86`, `src/lib/tarifas/data/schema.ts:325-332` |
| Bandeja (frontend) | `src/pages/oms/bandeja/KindBadge.tsx`, `src/i18n/local/es/omsBandeja.ts:31-34` |
| Tracking (frontend) | `src/pages/tracking/components/ParadaItem.tsx:8-9`, `src/pages/tracking/types.ts:9` |
| Mock | `docs/tarifador/demo-data/MOCK_FLUJO_3_MODULOS.md`, `scripts/mock-tarifas/generar.ts`, `flujo.ts`, `cargar.mjs`, `exportar.ts`; `scripts/demo-usuario-devoluciones.py`; `scripts/seed-recolecta-demo.mjs` |
| App del chofer (repo `mobile`, solo lectura) | `frontend/src/components/return-button.tsx`, `frontend/src/lib/return-form.ts`, `frontend/src/sync/outbox.ts:22-43, 73-93, 165-201`, `frontend/src/sync/evidence.ts`, `frontend/src/__tests__/return-form.test.ts` |
| Despliegue | `DESPLIEGUE-DEVOLUCIONES.md` (raíz; referenciado por Liquidaciones, no revisado en detalle aquí) |
| Pendientes | `docs/devoluciones/pendientes/` |
