# Módulo Tracking — documentación completa

> Ruta web: `/tracking` · Código web: `src/pages/tracking/` · Backend web: `backend/tracking/` · Permiso: módulo `tracking`.
> Backend de la app del chofer: `backend/mobile/` · App del chofer (repo hermano, solo lectura): `mobile/frontend/src/`.
> Documento escrito el 2026-11-05 a partir de la lectura del código. Donde algo no se pudo confirmar en el código
> se marca **no verificado**. No se consultó la BD Aurora: los estados de migraciones se toman de los documentos del
> repo y de su verificación declarada, y deben reconfirmarse con Intelix.
> Documentos complementarios (no duplicados aquí): [contrato-api-v2.md](./contrato-api-v2.md) (contrato de endpoints),
> [decisiones.md](./decisiones.md), [modo-mock.md](./modo-mock.md), [pendientes-tunel.md](./pendientes-tunel.md),
> [alternativas-mapas.md](./alternativas-mapas.md), [pendientes/README.md](./pendientes/README.md).
> Módulo relacionado: [Devoluciones](../devoluciones/pendientes/README.md) (la devolución del chofer llega allí).

---

## 1. Qué hace el módulo

Tracking es **monitoreo en vivo** de los viajes en curso. Responde: *¿dónde va cada camión, cómo va el avance,
qué alerta tiene, qué evidencias de entrega existen?*

- **Lee** viajes (`tbl_routes`), paradas (`tbl_dispatch_guides`), posiciones GPS, presencia de choferes y evidencias.
- **Recibe** desde la app del chofer: posiciones en lotes, transiciones de parada (entregada / fallida), evidencias
  (foto de factura, firma, foto de producto), devoluciones, consentimiento GPS y latidos de presencia.
- **Calcula** progreso, señal GPS, alertas, ETA y retraso de cada parada (todo en el servidor).

Lo que **NO** hace:
- No crea, asigna, reprograma, cancela ni completa viajes desde la web: eso es de Planificación.
  El endpoint de completar fue retirado el 2026-10-17 (`tracking_reviews` quedó sin uso; ver
  [contrato-api-v2.md](./contrato-api-v2.md#retirado-en-v2)).
- No muestra novedades ni devoluciones en el monitor (ver §7 y §10).
- No envía notificaciones (el correo de aviso está pendiente: [pendientes/01](./pendientes/01-correo-aviso-siguiente-parada.md)).

> **Matiz importante (contradicción documental):** la documentación de Tracking dice que el viaje lo termina
> solo Planificación y que el cierre automático es pendiente. El **backend de la app del chofer sí cierra el viaje**
> al registrar la última parada (§6.4). Ver §10.

---

## 2. Pantalla web (`/tracking`)

### 2.1 Enrutamiento y rol

- Ruta: `src/router/config.tsx:138-141` (`/tracking` → `TrackingPage`).
- `src/pages/tracking/page.tsx:30-33`: si `appUser.role.name === 'Cliente'` renderiza `MisEntregas`; si no,
  `TrackingMonitor` (monitor completo).
- Permisos: el módulo `tracking` se declara en `sql/15_matriz_permisos_roles.sql:30`. Sus asignaciones por rol:
  - `Chofer`: `tracking:view` (`sql/15:74`), ampliado a view + create + edit por `sql/43_tracking_app_chofer.sql`
    (líneas 7, 21-26). El backend lo restringe por conductor enlazado (§3.2).
  - `Cliente`: `pedidos:view` y `tracking:view` (`sql/15:75-76`).
- En la web, `useModulePermissions('tracking').canCreate` (`page.tsx:38`) solo muestra los controles de prueba,
  que existen únicamente en modo mock (`page.tsx:105-112`, `169-175`).

### 2.2 Zonas de la pantalla del monitor (`TrackingMonitor`, `page.tsx:36-178`)

| Zona | Componente | Qué muestra |
|---|---|---|
| Encabezado | `page.tsx:103-113` | Título; en mock, controles de simulación y "Iniciar viaje (pruebas)" |
| Aviso de datos viejos | `page.tsx:115-121` | Si falla la última consulta pero hay datos previos: "Sin conexión: mostrando datos de hace X" + reintentar |
| KPIs | `components/ResumenBar.tsx` (`page.tsx:123`) | En ruta, a tiempo, retrasados, sin señal, completados hoy. Clic filtra lista y mapa (`pickKpi`, `page.tsx:89-94`) |
| Lista | `components/ViajesSidebar.tsx` + `ViajeCard.tsx` | Activos / Todos, búsqueda, tarjeta con avance (`ProgressBar`), alertas (`AlertDots`), "última señal hace X" |
| Choferes en línea | `components/ChoferesEnLinea.tsx` | Choferes con la app abierta sin viaje (solo administrador; `page.tsx:62`, `128`) |
| Mapa | `components/FlotaMapa.tsx` (lazy) | Un camión por viaje, agrupación en burbujas, ruta por calles, sede y paradas |
| Panel del viaje | `components/ViajeDetallePanel.tsx` + `ParadaItem.tsx` | Conductor · placa, avance, "rumbo a la parada N", paradas con evidencias |

Filtro de KPI (`tracking-logic.ts:175-189`, `matchesKpi`): `late` = activo con alerta `late`; `on_time` = activo sin
`late`; `no_signal` = activo con `no_signal`; `completed_today` = completado con `ended_at` del mismo día local
del país. La web **no** tiene umbrales propios: pinta `signal`, `color` y `alerts` tal como llegan
(`tracking-logic.ts:2`).

Paradas en el panel: `ParadaItem.tsx:8-9` define las evidencias esperadas por tipo:
- entrega (`delivery`): `photo_invoice` + `signature`;
- recolecta (`collection`): `photo_product` + `signature`.

La web **no** muestra `photo_return` (ver §7.6).

Filtro por KPI y límite: con un KPI elegido se pide el máximo (`MAX_LIMIT = 100`, definido en `page.tsx:24`, usado en `page.tsx:58`); si la lista
trae menos que el total del KPI se avisa (`tracking.kpiPartial`, `page.tsx:83-86`).

Mapa del viaje elegido: ruta por calles (OSRM, `route-osrm.ts`, `hooks/useRutaOsrm.ts`; sin respaldo en línea
recta), tramos hechos sólidos y pendientes punteados (`components/map/RutaViaje.tsx`). Orden visual de paradas por
cercanía a la sede (`stop-order.ts`): solo visual; la secuencia de Planificación, la "siguiente parada" y el ETA
no cambian. Agrupación de camiones por distancia en pantalla (`components/map/cluster.ts`).

### 2.3 Vista del cliente (`MisEntregas`, rol `Cliente`)

- `components/MisEntregas.tsx:64-84`: título, lista de tarjetas (una por entrega), sin acciones. Solo lectura.
- Datos: `GET /api/v1/tracking/mis-entregas` (`api.ts:71-72`), refrescado con `useMisEntregas`
  (`hooks/useViajesEnVivo.ts:45-48`).
- Cada tarjeta muestra: punto de entrega, pedido, dirección, estado (`listo`, `en_camino`, `entregado`,
  `no_entregado`, `cerrado`), frase principal con ETA (`MisEntregas.tsx:17-27`), paradas antes, distancia,
  hora de último dato, permanencia en sitio si está entregada y un mapa pequeño (`MapaEntrega.tsx`) solo mientras
  el camión viene hacia ella.
- No ve chofer, placa, teléfono ni otras paradas (`backend/tracking/src/tracking_sql.py` y
  `app.py:496-527`, `_client_item`).

### 2.4 Polling y refresco

- Intervalo de la web: `api.ts:19` define `POLL_MS = 10_000` y `api.ts:20` `MOCK_POLL_MS = 3_000`;
  `pollIntervalMs()` (`api.ts:38`) lo devuelve. **Contradicción:** `decisiones.md`, `alternativas-mapas.md` y `modo-mock.md` decían
  "cada 15 s". El código usa **10 s** en real.
- `hooks/polling-runner.ts`: `POLL_INTERVAL_MS = 5_000` (`:6`) es el valor por defecto, pero las páginas siempre
  pasan `pollIntervalMs()`, así que no se usa en el monitor. `REQUEST_TIMEOUT_MS = 15_000` (`:7`),
  `MAX_BACKOFF_MS = 60_000` (`:8`).
- Comportamiento (`polling-runner.ts:58-80`): una sola consulta en vuelo; timeout con abort; tras un error el
  espera se duplica hasta 60 s (`backoffDelay`, `:36-38`); con la pestaña oculta no consulta (`:60`); al volver
  a la pestaña consulta de inmediato (`:82`).
- Lista + KPIs en **una** llamada: `useViajesEnVivo.ts:17-27` pide `listViajes(... summary: true)`.
- Choferes en línea: se detiene (sin reintentar) ante 401/403 (`useViajesEnVivo.ts:29-36`).
- Detalle del viaje abierto: `useViajeDetalle` (`:39-42`), sin consulta si no hay viaje seleccionado.
- Cambio de país: cierra el viaje abierto (`page.tsx:51`) y limpia el dato (`resetKey`).

### 2.5 Errores

`api.ts:85-91` (`errorKey`): 404 → `tracking.errorNotFound`; 401/403 → `tracking.errorForbidden`;
409 → `tracking.errorConflict`; resto → `tracking.errorGeneric`. La UI traduce por código, no por el texto del
backend (que viene en español).

### 2.6 Modo mock (solo desarrollo)

`isTrackingMock()` (`api.ts:34`) activa la simulación en memoria (`src/pages/tracking/mock/`, instalada desde
`src/main.tsx`). Detalle en [modo-mock.md](./modo-mock.md). Es un mock **de la web**, distinto de la **data mock de
BD** (`scripts/mock-tarifas`, §8).

---

## 3. Backend web (`backend/tracking`)

Tres archivos: `src/app.py` (handlers y ruteo), `src/tracking_logic.py` (reglas puras, sin BD ni AWS),
`src/tracking_sql.py` (SQL con placeholders `%s`).

### 3.1 Endpoints (`app.py:940-954`, tabla `ROUTES`)

| Método y ruta | Handler | Quién | Qué hace |
|---|---|---|---|
| `GET /api/v1/tracking/viajes` | `list_viajes` (`app.py:383`) | admin (no Chofer ni Cliente) | Lista paginada con `q`, `activos`, `pais`, `include=summary`, cursor |
| `GET /api/v1/tracking/viajes/{id}` | `get_viaje` (`app.py:426`) | admin; Chofer solo los suyos | Detalle con paradas y evidencias firmadas |
| `GET /api/v1/tracking/resumen` | `summary` (`app.py:564`) | admin | **Deprecado**: usar `viajes?include=summary` |
| `GET /api/v1/tracking/planificados` | `list_planificados` (`app.py:594`) | admin | Planes confirmados sin viaje (uso del mock) |
| `GET /api/v1/tracking/choferes` | `list_choferes` (`app.py:570`) | admin | Choferes con presencia en 30 min |
| `GET /api/v1/tracking/mis-entregas` | `list_mis_entregas` (`app.py:530`) | Cliente | Solo sus entregas (§5) |
| `GET /api/v1/tracking/mi-viaje` | `my_trips` (`app.py:904`) | Chofer | Agenda del chofer (usada por la app web/mock) |
| `POST /api/v1/tracking/viajes/{id}/iniciar` | `start_viaje` (`app.py:616`) | admin (create) | Puente plan → ruta (mock; ver §6.1) |
| `POST /api/v1/tracking/posiciones` | `ingest_positions` (`app.py:743`) | admin o Chofer | Lote de posiciones, idempotente por `client_id` |
| `POST /api/v1/tracking/paradas/{id}/transicion` | `transition_stop` (`app.py:781`) | admin o Chofer | `pending`/`delivered`/`failed` |
| `POST /api/v1/tracking/paradas/{id}/evidencias/upload-url` | `evidence_upload_url` (`app.py:835`) | admin o Chofer | Formulario firmado de subida a S3 |
| `POST /api/v1/tracking/paradas/{id}/evidencias` | `evidence_confirm` (`app.py:859`) | admin o Chofer | Confirma la subida y guarda la fila |
| `POST /api/v1/tracking/consentimiento-gps` | `record_consent` (`app.py:889`) | admin o Chofer | Consentimiento GPS por versión del aviso |

Todas las rutas van con la forma `{ "data": ..., "error": null }` (`app.py:137-138`). Compresión gzip para
cuerpos > 1 KB si el cliente la acepta (`app.py:959-978`). El contrato completo de campos está en
[contrato-api-v2.md](./contrato-api-v2.md).

### 3.2 Permisos, rol y alcance (`app.py:141-175`, `297-314`)

- `_caller(event, action, driver_ok, client_ok)` (`app.py:141-152`):
  1. `caller.require(MODULE, action)` con `tms_common.permissions` (acción `view`, `create`, `edit`);
  2. rol **Chofer** sin `driver_ok` → 403 "Esta acción es del administrador." (`app.py:144-145`);
  3. rol **Cliente** sin `client_ok` → 403 (`app.py:147-148`). **Cliente recibe 403 en todos los endpoints
     salvo `mis-entregas`** (y `consentimiento`/`mi-viaje` que no lo admiten, también 403);
  4. resuelve la organización del usuario (`ORG_SQL`); sin organización → 403.
- **Chofer**: `_own_or_404` (`app.py:161-169`) exige que el viaje/parada sea de su conductor
  (`drivers.app_user_id` = usuario, `DRIVER_BY_USER_SQL`). Si no le corresponde, responde **404** (no revela que
  existe). Sin conductor enlazado → 403.
- **País**: `_scope` (`app.py:297-314`) intersecta el parámetro `pais` (valida `^[A-Z]{2,3}$`, 400 si no) con los
  países del rol (`caller.country_filter`); nunca los amplía. `_check_country` (`app.py:172-175`) → 403 si el viaje
  es de otro país.
- Un viaje de otra organización responde 404 (`app.py:366-372`, `_route_access`).

### 3.3 Estados de viaje y de parada (`tracking_logic.py`)

- `route_state` (`tracking_logic.py:55-66`): normaliza el texto a `planned | active | completed | cancelled | unknown`.
  Acepta vocabularios antiguos (`en tránsito`, `active`, `completada`, `anulada`…). Solo se normaliza al **leer**;
  el módulo escribe `Planificada` / `En tránsito` / `Completada` (`tracking_logic.py:12-14`).
- `guide_state` (`tracking_logic.py:69-77`): `delivery_status` manda; `status` es respaldo.
- **Estado efectivo** en SQL (`tracking_sql.py:17-19`): si existe `plan_trips` vinculado,
  - `pt.status = 'completed'` → `Completada`;
  - `pt.status = 'cancelled'` → `Anulada`;
  - si no, el de `routes`.
  La hora de cierre (`END_EXPR`, `tracking_sql.py:18`) es `routes.actual_end_time` o, si lo cerró Planificación,
  `plan_trips.updated_at`.
- "Activo" (en `list_viajes` con `activos=1` y en los KPIs) = estado `active` **y** no terminado en Planificación
  (`OPEN_IN_PLAN`, `tracking_sql.py:19`).

### 3.4 Señal, color y alertas (`tracking_logic.py`)

| Concepto | Regla | Cita |
|---|---|---|
| Señal | `online` ≤ 300 s; `stale` ≤ 1800 s; `offline` después; `none` si nunca hubo posición ni presencia | `ONLINE_SECONDS`/`STALE_SECONDS` `:34-35`; `signal` `:84-105` |
| Presencia | `offline` explícito (logout) más reciente que la posición manda; un latido `online` más reciente cuenta como señal | `signal` `:84-105` |
| Color | verde = activo + `online`; ámbar = `stale`; gris = offline/none o no activo; azul = completado | `map_color` `:108-115` |
| Alerta `failed` | alguna parada fallida (`count` = fallidas) | `alerts` `:315-335` |
| Alerta `no_signal` | señal `offline` (hubo señal y caducó). `none` no alerta | `:329-330` |
| Alerta `late` | `days_late ≥ 1`: días calendario de la zona del país pasados de `due_date` (`days_late` `:303-312`) | `:331-332` |
| Alerta `stopped` | ≥ 20 min sin moverse más de 75 m, con **posición** `online` (no basta un latido) | `STOPPED_MIN=20` `:135`, `STOPPED_RADIUS_M=75` `:136`, `STOPPED_WINDOW_MIN=60` `:137`; `:333-334` |

`due_date` = `COALESCE(rp.plan_date, r.route_date)` (`tracking_sql.py:24`). `late` se cuenta por **día**, no por la
hora de cada parada: el día de entrega aún no está atrasado (`tracking_logic.py:303-305`).

`stopped_minutes` se calcula en la BD (`STOPPED_SINCE_SQL`, `tracking_sql.py:75-93`): desde cuándo la última
posición está a menos de 75 m de las anteriores, con ventana de 60 min, excluyendo puntos `is_mock` y con precisión
> 200 m.

### 3.5 Progreso, ETA y retraso

- `progress` (`app.py:254-288`, `_viaje`): `done = delivered + failed` (las fallidas cuentan como cerradas);
  `percent = done*100/total`. Cuenta sobre `dispatch_guides` (`PROGRESS_SQL`, `tracking_sql.py:49-57`), no sobre el
  contador `completed_stops`.
- ETA (`tracking_logic.py:179-236`, `drive_minutes` y `stop_metrics`): línea recta × 1,35 a 30 km/h + 5 min de servicio por parada, encadenando
  las paradas pendientes en orden de secuencia desde la última posición. Las constantes son las mismas de Planificación
  (comentario `:128-129`). `delay_min` = minutos de la ETA contra `planned_arrival_time` de la parada. Solo informativo:
  **no genera alerta** (contrato).
- Sin posición o con señal `offline`, no hay ETA (`app.py:198-211`, `_live`).
- Hora planificada de la parada: `plan_schedule` (`tracking_logic.py:188-204`) se calcula al iniciar el viaje
  (`app.py:645-651`). Si no hay coordenadas de la sede, no hay horas planificadas (no se inventa retraso).

### 3.6 Sedes de origen (`tracking_logic.py:140-158`)

`origin_coords` aplica el orden: sede fija por empresa (`CUSTOMER_ORIGINS`: FEBECA, SILLACA, BEVAL) > coordenadas de
la tienda de origen > sede fija del país (`COUNTRY_ORIGINS`: CR). **Estas sedes son de prueba**, hardcodeadas en
código (comentario `:140-142` y pendiente en [pendientes-tunel.md](./pendientes-tunel.md)). Se usan para detectar la
salida de la sede (> 300 m, `DEPARTURE_RADIUS_M`, `:138`) y para la fase `por_salir` / `en_ruta`.

Fase (`_viaje`, `app.py:257-261`): `en_ruta` si `routes.departed_at` existe, si hay paradas cerradas, o si la última
posición está fuera de la sede; si no, `por_salir`.

### 3.7 Ingesta de posiciones (`app.py:682-767`, `_ingest`)

1. Valida cada punto (`validate_position`, `tracking_logic.py:359-382`): `client_id` y `route_id` UUID, lat/lng en
   rango, `accuracy_m` ≤ 100000, `speed_mps` ≤ 90, `battery_pct` 0-100, `recorded_at` no más de 5 min en el futuro
   (`MAX_FUTURE_SKEW`, `:38`). Lote ≤ 200 (`MAX_BATCH`, `:37`).
2. Solo acepta viajes **activos** o completados hace menos de **2 h** (`route_accepts`, `tracking_logic.py:296-300`;
   `GRACE_AFTER_CLOSE`, `:39`). Otros → `rejected` ("viaje no activo" / "viaje no encontrado").
3. Un chofer solo escribe sus viajes; los ajenos se tratan como inexistentes (`app.py:686-689`).
4. Inserta en `tbl_tracking_positions` con `ON CONFLICT (client_id) DO NOTHING` (idempotencia; `app.py:708-710`).
5. Solo un punto **nuevo, usable y de viaje activo** mueve `tbl_tracking_last_positions` (`app.py:713-727`).
   "Usable" = no `is_mock` y precisión ≤ 200 m (`positions_usable`, `tracking_logic.py:291-293`). Un punto de la
   gracia se guarda pero no mueve la última posición.
6. Primera salida de la sede (> 300 m): fija `routes.departed_at` una sola vez (`app.py:729-740`).
7. Todo el lote en **una transacción** (`pg.run_in_transaction`, `app.py:765`).
8. **No** se detectan visitas a paradas en este camino (ver §3.9 y §10).

### 3.8 Transición de parada (`app.py:781-832`)

- Admin puede volver a `pending`; el chofer no (403, `app.py:789-791`).
- `failed` exige motivo (400).
- Chofer debe enviar `lat`/`lng` para entregar (400, `app.py:808-809`).
- Geocerca de 150 m (`GEOFENCE_M`, `tracking_logic.py:25`): fuera de rango, "Entregado" exige motivo (400); con
  motivo se registra además el evento `geofence_out` (`app.py:826-828`).
- Actualiza `dispatch_guides` (`UPDATE_GUIDE_SQL`), recalcula `completed_stops` y escribe `tbl_tracking_events`.
- **No cierra el viaje.** Con la última parada queda "Sin paradas pendientes · se cierra desde Planificación"
  (`app.py:829` devuelve `done`/`pending`; no hay `CLOSE_ROUTE`). Ver §6.4 para el cierre automático de la app.

### 3.9 Evidencias (`app.py:835-886`)

- Tipos aceptados: `photo_invoice`, `photo_product`, `signature` (`tracking_logic.py:42`). `photo_other` → 422 (`:393-394`).
  `photo_return` **no** está en la lista de la web.
- Mime: solo JPG/PNG (`EVIDENCE_MIME`, `:43`); tamaño ≤ 5 MB (`:41`).
- `evidence_upload_url`: genera una llave `tracking/{route}/{guide}/{uuid}.{ext}` (`new_evidence_key`, `:385-386`) y un
  POST firmado de 300 s (`URL_TTL_SECONDS`, `:44`).
- `evidence_confirm`: valida la llave contra el patrón de **esa** parada (`require_evidence_key`, `:402-407`), hace
  `HEAD` en S3 (`_head`, `app.py:849-856`), exige imagen y tamaño (`require_uploaded_image`, `:410-418`), inserta en
  `tbl_tracking_evidences` (`ON CONFLICT (storage_key) DO NOTHING`) y actualiza `photo_url` / `signature_url` de la
  guía (`app.py:880-883`).
- Lectura: la web recibe URLs firmadas de lectura (`_signed_get`, `app.py:86-102`), válidas 1 h y reutilizadas desde
  caché del Lambda mientras les queden más de 10 min (`tracking_logic.py:45-46`). El bucket se elige por fila: si la
  fila trae `storage_bucket` igual a `MOBILE_EVIDENCE_BUCKET`, se firma en ese bucket; si no, en `TRACKING_BUCKET`
  (`evidence_bucket`, `app.py:65-70`). Si la firma falla, la evidencia queda sin URL y el detalle sigue cargando
  (`_evidence_url`, `app.py:77-83`).
- La app del chofer **no** recibe URLs firmadas (`app.py:480`).

### 3.10 Otros endpoints

- **Consentimiento** (`record_consent`, `app.py:889-901`): una fila por usuario y versión (`ON CONFLICT (app_user_id,
  version)`, `tracking_sql.py:282-288`). **Ni el backend web ni el móvil bloquean la ingesta si no hay consentimiento**
  (ver §9).
- **Presencia / choferes** (`DRIVERS_PRESENCE_SQL`, `tracking_sql.py:108-120`): presencia de los últimos 30 min,
  con su viaje abierto si lo tiene.

---

## 4. Relación con la app del chofer (`backend/mobile`)

La app del chofer tiene **su propio backend** (`backend/mobile/src/mobile_api/`), con prefijo `/api/mobile/v1`
(`routes.py:16`). Escribe en las **mismas tablas** que la web (BD compartida) y hace lo mismo que el monitor en
términos de datos, con reglas espejo (constantes de ETA, geocerca y gracia copiadas de `tracking_logic.py`,
comentarios en `mobile_api/logic.py:1-4`).

Rutas (`routes.py:18-37`):

| Ruta | Pública | Handler |
|---|---|---|
| `GET /salud` | sí | — |
| `POST /auth/login`, `/auth/refresh`, `/auth/logout` | sí | `auth.py` |
| `GET /mi-viaje` | no | `trips.my_trips` |
| `POST /viajes/{id}/iniciar` | no | `start.start_trip` |
| `POST /posiciones` | no | `positions.ingest_positions` |
| `POST /presencia/heartbeat` | no | `presence.heartbeat` |
| `POST /paradas/{id}/transicion` | no | `stops.transition_stop` |
| `POST /paradas/{id}/novedades` | no | `stops.add_incident` |
| `GET /paradas/{id}/articulos` | no | `stops.list_items` |
| `POST /paradas/{id}/devoluciones` | no | `stops.add_return` |
| `POST /paradas/{id}/evidencias/upload-url` y `/evidencias` | no | `evidence.upload_url` / `confirm` |
| `POST /consentimiento-gps` | no | `consent.record_consent` |

Ruteo: una sola ruta comodín en AWS; `resolve` reconstruye la ruta real a partir de `rawPath` (`routes.py:42-67`).
Cada escritura se envuelve con la **bitácora de auditoría** (`audit.bind`/`clear`, `routes.py:80-85`); la BD fija el
actor por transacción.

### 4.1 Login y sesión (`auth.py`)

- Credenciales: las mismas del TMS (`tbl_auth_credentials`, `sql.py:LOGIN_SQL`). El backend firma **sus propios
  tokens** con un secreto distinto (`config.jwt_secret`, `config.py:37-43`): un token de la app no sirve en el TMS.
- Solo entra un usuario con rol **Chofer** y conductor enlazado (`_driver_from_row`, `auth.py:38-50`). Otros → 403
  (`not_a_driver`, `inactive_user`, `no_organization`).
- Access token: JWT HS256 de **1 h** (`security.py:14`). Refresh: token opaco de **30 días** (`security.py:15`),
  guardado solo como hash SHA-256 y **rotado** en cada uso (`auth.py:143-168`).
- Reuso de un refresh ya canjeado: si pasa de 60 s (`REFRESH_REUSE_GRACE_SECONDS`, `auth.py:25`) se revocan todas las
  sesiones del usuario y se audita (`refresh_reuse_detected`); dentro de la gracia se entrega una sesión nueva.
- Freno de fuerza bruta: 5 fallos por correo o 30 por IP en 15 min → 429 (`auth.py:20-21`, `110-140`).
- Logout (`auth.py:170-185`): revoca el refresh y marca al chofer `offline` con la hora del teléfono
  (`occurred_at`, no pisa un login posterior).
- Contexto del chofer cacheado 60 s por contenedor (`CONTEXT_TTL_SECONDS`, `auth.py:53`): desactivar un usuario tarda
  como máximo ese tiempo en cortar acceso.

### 4.2 Agenda: `mi-viaje` (`trips.py`)

- Devuelve **un** viaje: el primero de sus viajes en tránsito con paradas pendientes; si todos están terminados,
  el último (`_current`, `trips.py:109-116`). Los planes confirmados de hoy por iniciar (`MY_PLANNED_SQL`, zona de respaldo `America/Costa_Rica`, `sql.py:138`) se suman a la lista, pero la respuesta contiene **solo un** elemento (`_current`, `trips.py:109-116`).
- Cada parada trae `type` (`delivery`/`collection`), `evidence_kinds` (qué evidencias ya tiene) y ETA
  (`trips.py:35-76`).
- Consulta de viajes activos: `MY_ROUTES_SQL` (`sql.py`), limitada a 10 y sin viajes cuyo plan esté cerrado.

### 4.3 Iniciar viaje (`start.py:26-94`)

- Solo el conductor del plan (404 si es de otro). Idempotente: si la ruta ya existe responde la misma (200).
- Requisitos que la web **no** exige: transportista asignado (409 `no_carrier`) y un único viaje sin terminar
  (409 `trip_in_progress`, `UNFINISHED_ROUTE_SQL`). Además: plan confirmado, viaje pendiente, paradas y tienda de origen.
- Crea `tbl_routes` ("En tránsito"), `tbl_dispatch_guides` en orden de parada y el evento `route_started`
  (`start.py:71-81`). La docstring dice que "es el mismo resultado que la web"; **no es idéntico** (la web no valida
  transportista ni viaje único). Ver §10.

### 4.4 Posiciones (`positions.py:47-126`)

Mismo contrato que la web (ver §3.7) con diferencias:
- Solo viajes **del conductor** (`ROUTES_FOR_POSITIONS_SQL` filtra `driver_id`, `sql.py`).
- Fecha del punto acotada a "ahora" con tolerancia de **1 día** (`MAX_FUTURE_SKEW`, `logic.py:40`, `clamp_to_now`):
  un reloj adelantado no pierde el dato, se guarda como "ahora". La web rechaza más de 5 min en el futuro.
- Después de escribir actualiza la presencia (`presence.touch`, `positions.py:124-125`).
- **Llegadas y salidas de paradas** (`record_visits`, `positions.py:20-44`): con cada lote usable, `logic.detect_visits`
  (`logic.py:202-245`) abre una visita al entrar a ≤ 150 m y la cierra al salir de > 200 m (histéresis). Una parada
  pendiente que se atraviesa en < 60 s no cuenta. Escribe en `tracking_stop_visits` (`UPSERT_VISIT_SQL`,
  `DELETE_VISIT_SQL`). Esto es lo que alimenta "tiempo en sitio" de la web (`tracking_sql.py:136`, `GUIDES_SQL`).
  **Solo existe en el camino móvil** (ver §10).

### 4.5 Transición de parada (`stops.py:46-128`)

- Valores: `delivered` y `failed` (`pending` → 403 `revert_not_allowed`, `stops.py:53-54`).
- `type` opcional (`delivery`/`collection`); el tipo real lo decide el servidor desde `dispatch_guides.stop_type`
  (`stops.py:100`).
- Motivos: `reason_code` de la lista `FAR_REASON_CODES` (`logic.py:31-37`: `cliente_pidio_otro_punto`,
  `acceso_bloqueado`, `sin_estacionamiento`, `zona_insegura`, `gps_impreciso`, `otro`); `otro` exige texto.
  Fallida exige motivo. Entrega lejos del punto exige motivo (`outside_geofence`, `stops.py:94-97`).
- **Entrega sin lat/lng → 400 `location_required`** (`stops.py:91-93`); el móvil no permite entregar sin ubicación
  (ver §10 sobre la contradicción con el flujo de prueba).
- **Evidencias obligatorias por tipo** (`REQUIRED_EVIDENCE`, `logic.py:49`; comprobación `stops.py:100-102`):
  - entrega: `photo_invoice` + `signature`;
  - recolecta: `photo_product` + `signature`.
  Si faltan → 400 `evidence_required`.
- Idempotencia: con `client_id` (cola offline) un reenvío no duplica el evento (`INSERT_EVENT_ONCE_SQL`,
  `stops.py:35-43`). Reenviar la última parada de un viaje ya cerrado devuelve 200 con `route_closed: true`
  (`stops.py:75-81`).
- **Cierre automático del viaje** (`stops.py:116-123`): si esta transición fue la **última pendiente** del viaje
  (`pending == 0`), y el viaje estaba activo, se ejecuta:
  1. `CLOSE_ROUTE_SQL`: `tbl_routes.status = 'Completada'`, `actual_end_time`, `completed_stops`;
  2. `CLOSE_PLAN_TRIP_SQL`: `tbl_plan_trips.status = 'completed'` (solo si estaba `pending`);
  3. evento `route_completed`.
  Todo en la misma transacción que la parada.

### 4.6 Novedades (`stops.py:130-150`)

`POST /paradas/{id}/novedades` acepta `kind` `incident` o `pickup`, con descripción obligatoria. Escribe un evento
(`tbl_tracking_events`) con `client_id` opcional. La web **no** muestra novedades (retiradas en v2). En la app solo
se usa `incident` (ver §10 sobre `pickup`).

### 4.7 Devoluciones contracamión (`stops.py:157-238`)

Ver §7 (flujo completo de la foto y de la devolución).

### 4.8 Presencia (`presence.py`)

- `POST /presencia/heartbeat` (`presence.py:66-71`) y la presencia que escriben login, logout y posiciones.
- Es de **mejor esfuerzo**: un fallo se registra en el log y nunca tumba login, logout ni posiciones
  (`presence.py:1-5`).
- `last_seen_at` es la hora del evento en el teléfono, acotada a ahora; un evento atrasado no pisa uno más nuevo
  (`UPSERT_PRESENCE_SQL`, `sql.py`).

### 4.9 Consentimiento (`consent.py`)

`POST /consentimiento-gps` con `version` (≤ 40 caracteres) y `device_id` opcional; una fila por usuario y versión
(`INSERT_CONSENT_SQL`, `sql.py`). **El backend no exige el consentimiento para aceptar posiciones** (verificado: en
`positions.py` no hay comprobación). La app lo pide antes de operar (§8.3).

---

## 5. Vista del cliente — backend (`mis-entregas`)

- Permiso: rol `Cliente` (`app.py:534-535`, `client_ok=True`).
- Vínculo usuario → punto: tabla `tbl_tracking_client_access` (migración `backend/mobile/sql/m07_tracking_client_access.sql`),
  expuesta como vista `tracking_client_access`. Una fila apunta a un **punto de entrega** o a un **cliente destino**
  (`ck_tracking_client_access_target`, m07). Sin vínculo no ve nada.
- Coincidencia de parada: `CLIENT_ORDER_MATCH` (`tracking_sql.py:335-339`): el pedido apunta al mismo punto de entrega,
  o al mismo cliente destino si el vínculo es a cliente.
- Ventana: viajes en tránsito o cerrados hace menos de **6 h** (`CLIENT_RECENT_HOURS`, `tracking_logic.py:24`;
  `CLIENT_GUIDES_SQL`).
- Entregas "planificadas para hoy" que aún no tienen ruta: `CLIENT_PLANNED_SQL` las muestra como `listo`
  (`tracking_sql.py:364-379`). Hoy se calcula con zona de respaldo `America/Costa_Rica`.
- Estados que devuelve: `listo`, `en_camino`, `entregado`, `no_entregado`, `cerrado` (`app.py:503-515`).
  El camión solo aparece mientras viene hacia ella (`app.py:511-515`).
- Orden: en camino, listo, entregado, no entregado, cerrado (`app.py:559-560`).
- Pruebas de contrato: `backend/tests/test_tracking.py` (líneas ~1268-1338) verifican que filtra por usuario.

**Estado:** `m07` está aplicada en la BD de desarrollo y **no** en los demás ambientes; el vínculo se carga **a mano por SQL**
(ver [pendientes/03](./pendientes/03-vinculo-cliente-punto-entrega.md)). La prueba con datos reales sigue pendiente
([pendientes/02](./pendientes/02-aplicar-migraciones-y-prueba-e2e.md)).

---

## 6. Ciclo de vida de un viaje

### 6.1 Estados y quién los cambia

| Estado (`tbl_routes.status`) | Lo escribe | Dónde |
|---|---|---|
| `Planificada` | Planificación (vía plan) | No verificado en este repo (el mock lo usa) |
| `En tránsito` | Inicio del viaje: app del chofer (`start.py:57-62`), puente web `start_viaje` (`app.py:655-660`) | Código |
| `Completada` | **Cierre automático** al registrar la última parada (app del chofer, `stops.py:116-123`, `CLOSE_ROUTE_SQL`) | Código (móvil) |
| `Anulada` / `Anulado` | Planificación (vía `plan_trips.status = 'cancelled'`) | Lee tracking; escritura **no verificada** |

Estado de **plan_trip** (`tbl_plan_trips.status`): `pending` → `completed` (el móvil, al cerrar la última parada,
`CLOSE_PLAN_TRIP_SQL`) o `cancelled` (Planificación). El frontend de Planificación llama
`POST /api/v1/planificacion/viajes/{id}/completar|cancelar|reabrir` (`src/pages/planificacion/planes-api.ts:125-136`),
pero **no existe ningún handler de ese endpoint en el repo** (`ROUTES` de `backend/planning/src/app.py`, `app.py:160-168`, no lo tiene; una búsqueda en `backend/` solo halla comentarios). Las rutas de Planificación son `/pedidos`, `/bandeja`, `/planes`,
`/planes/replanificar`). La transición de viaje que llama el frontend no tiene backend en el repo.

### 6.2 Quién lee el estado

- **Tracking** lee `plan_trips.status` para mostrar Completada/Anulada y sacar el viaje de "Activos" (§3.3).
- **Liquidaciones** lee `tarifas_v_viajes` (`sql/27_tarifas_vista_viajes_un_recorrido.sql`), que toma `routes.status`
  y lo traduce (`completada` → `completed`, `en tránsito` → `in_progress`, etc.; líneas ~19-26). **Por eso el cierre
  automático de la app es lo que hace liquidable un viaje**: si nadie escribe `Completada` en `routes`, el viaje
  no aparece como completado. Tracking documenta que `routes.status` "ya no lo cambia nadie" desde el 2026-10-17
  (`docs/tracking/decisiones.md`, §3); esa afirmación **ya no es exacta** desde que existe el cierre del móvil.
- **Planificación** (`replan.py:34`) no re-arma días con viajes `completed`/`cancelled`.

### 6.3 Ejemplo de flujo normal

1. Planificación confirma el plan (`plan_route_plans` `confirmed`) y deja viajes `pending`.
2. El chofer abre la app y toca **Iniciar** → `start.py` crea la ruta `En tránsito` y sus guías.
3. La app manda posiciones en lotes; se mueve el camión y se fija `departed_at` al salir de la sede.
4. Cada parada: evidencias (foto + firma) y transición `delivered`/`failed`. Cada transición recalcula `completed_stops`.
5. La última transición pendiente → `Completada` en `routes`, `completed` en `plan_trips`, evento `route_completed`.
6. Tracking deja de mostrarlo como activo; Liquidaciones lo ve como completado.

### 6.4 Cierre: lo que hace y lo que no hace cada backend

| Acción | Backend móvil | Backend web (tracking) |
|---|---|---|
| Cierra el viaje con la última parada | **Sí** (`stops.py:116-123`) | **No** (`app.py:781-832`) |
| Marca `plan_trips` completed | Sí, solo en ese cierre | No |
| Endpoint de completar/revisar | No | No (retirados) |

Consecuencia: el cierre depende de que el chofer use la **app**. Si la última parada se cierra desde la web (modo admin),
el viaje queda "Sin paradas pendientes" hasta que Planificación lo complete (que no tiene handler verificado en este repo).
Ver §10.

### 6.5 Lo que el pendiente documenta vs. el código

[pendientes-tunel.md](./pendientes-tunel.md) lista como pendiente el "cierre automático y sincronización entre
módulos". El código del móvil ya lo implementa (`CLOSE_ROUTE_SQL`/`CLOSE_PLAN_TRIP_SQL`, `stops.py`). Lo que sigue
**sin verificar** es que esté desplegado y aplicado en Aurora, y la sincronización de Planificación. Se debe
actualizar el pendiente.

---

## 7. Devoluciones contracamión: de la app a Devoluciones

### 7.1 Qué es

Una devolución que el chofer registra **en la parada**, al entregar: los artículos que regresan al almacén, con
motivo, cantidad y foto del producto. Es distinta de la **recolecta** (buscar mercancía ya entregada, `stop_type =
'collection'`, migración `m05`), que Planificación todavía no asigna (`docs/devoluciones/pendientes/02-flujo-recolecta.md`).

### 7.2 Flujo completo

1. **Artículos**: la app pide `GET /paradas/{id}/articulos` (`stops.py:181-190`, `list_items`). Lee `tbl_order_items` del
   pedido (`ORDER_ITEMS_SQL`). Si el viaje no está en tránsito → 409.
2. **Formulario** (app): elige artículos (tope = cantidad de la línea; los manuales no tienen tope), motivo y foto
   (`return-form.ts`, `return-button.tsx`; ver §8.5).
3. **Foto** (outbox, primero): la app encola una evidencia `photo_return` (JPEG) con su propio `client_id`
   (`outbox.ts:79-83`). Se sube a S3 con el mismo flujo de evidencias (`upload-url` → S3 → `POST evidencias`).
   La llave es `pedidos/<número>/<id del pedido>/photo_return-<uuid>.jpg` (`logic.py:326-346`), en el **bucket de la app**
   (`EVIDENCE_BUCKET`, `config.py:46-47`).
4. **Confirmación de la foto**: `evidence.confirm` la guarda en `tbl_tracking_evidences` con `kind = 'photo_return'`
   (`sql.py`, `INSERT_EVIDENCE_SQL`). **Aquí falla hoy** (§7.5).
5. **Devolución** (outbox, después, encadenada a la parada): `POST /paradas/{id}/devoluciones` con `items[]`,
   `reason`, `notes`, `client_id` y `photo_client_id` (`outbox.ts:85-91`; `stops.py:193-238`).
6. **Enlace foto ↔ devolución**: el servidor busca la foto por `dispatch_guide_id` + `kind = 'photo_return'` +
   `client_id = photo_client_id` (`RETURN_PHOTO_SQL`, `sql.py`). Si no existe → 400 "La foto de la devolución aún no se
   confirmó" (`stops.py:211-219`). Así la llave S3 la conoce el servidor y el teléfono no la envía.
7. **Filas**: una fila en `tbl_returns` **por artículo** (`INSERT_RETURN_SQL`, `return_type = 'contracamion'`,
   `photo_url` = la llave). `return_number` = `DV-<client_id>` (o `-n` por línea si hay `items[]`). Reenviar no duplica
   (`ON CONFLICT (organization_id, return_number)`). Se registra un evento `return` en `tbl_tracking_events`
   (`stops.py:232-234`).
8. **Devoluciones (módulo web)**: `admin_returns_sql.py` lee `tbl_returns` con `photo_url` y `return_type`
   (`admin_returns_sql.py:30-31`). `backend/admin/src/admin_media.py` convierte la llave en URL firmada de 1 h
   (`signed_photo_url`, `:28-40`), solo si la llave cumple el patrón `pedidos/...` y existe `MOBILE_EVIDENCE_BUCKET`.
   Si no, devuelve `None` y la pantalla oculta "Ver foto" sin fallar.

### 7.3 Por qué `tbl_returns.photo_url` es llave y no URL

Las URLs firmadas caducan; la llave es estable. El que firma es el módulo que la muestra (Devoluciones), con el
bucket del stack móvil.

### 7.4 Por qué la web de Tracking NO muestra `photo_return`

- `tracking_sql.py:11` define `EVIDENCE_KINDS_SQL = ('photo_invoice', 'signature', 'photo_product')`, y
  `EVIDENCES_SQL` (`tracking_sql.py:149-152`) filtra por esos kinds.
- `tracking_logic.py:42` tampoco lo incluye.
- Motivo de diseño: el monitor muestra la evidencia de **entrega** (factura y firma) y la de recolecta; la foto del
  artículo devuelto es de Devoluciones. Las devoluciones no se muestran en Tracking (decisión de v2).
- La app sí lo acepta (`backend/mobile/src/mobile_api/logic.py:44`).

### 7.5 Precaución destacada: la restricción de la BD NO incluye `photo_return` hoy

- `backend/mobile/sql/m08_photo_return.sql` amplía el CHECK `ck_tracking_evidence_kind` para permitir `photo_return`.
  **No está aplicada en la BD compartida (Aurora).** Verificado el 2026-11-05: el CHECK vigente es
  `kind IN ('photo_invoice','photo_product','signature','photo_other')` y un `INSERT` de prueba con `photo_return`
  (en transacción revertida) fue rechazado por `ck_tracking_evidence_kind`.
- Efecto: el `INSERT` de la foto `photo_return` **falla** en `evidence.confirm`, la devolución nunca encuentra su foto
  y `add_return` responde 400 "La foto de la devolución aún no se confirmó". La app deja la devolución encadenada
  en el outbox (ver §8.4): no se pierde, pero no se completa.
- Migración de rollback en el encabezado de `m08`. Aplicar con `python scripts/migrate.py sql/m08_photo_return.sql`.
  Despliegue: Intelix ([devoluciones/pendientes/01](../devoluciones/pendientes/01-despliegue-contracamion.md)).

---

## 8. App del chofer (repo hermano, `mobile/frontend/src`, solo lectura)

Resumen verificado del código por el agente de lectura y sus citas. Rutas relativas a `mobile/frontend/src/`.

### 8.1 Pantallas (`app/`)

| Pantalla | Función |
|---|---|
| `login.tsx` | Login (401 credenciales, 429 demasiados intentos, sin red) |
| `index.tsx` | Agenda: viaje actual y sus paradas; banner de copia sin conexión; inicio del viaje |
| `parada/[id].tsx` | Detalle de parada: entregar (asistente con foto y firma), fallida, novedad, devolución (`ReturnButton`) |
| `firma.tsx` | Firma digital (PNG desde canvas, sin reescalar) |
| `consentimiento.tsx` | Aviso de ubicación (versión `gps-2026-10`, `gps/state.ts:8`) |
| `gps.tsx` | Estado del GPS y cola de posiciones |

Protección de rutas (`app/_layout.tsx:76-85`): sesión requerida para todo menos `login`.
Las acciones de parada solo se habilitan si el viaje está en tránsito (`parada/[id].tsx:189-191`).

### 8.2 Sesión y red

- Tokens en SecureStore (`auth/session.ts:9-13`). El id del dispositivo va en SQLite (`gps/state.ts:49-56`).
- Ante `token_expired` renueva una vez con una petición compartida (`api/http.ts:81-94`). Si el refresh es rechazado,
  cierra sesión; si cae por red, la mantiene (`auth/session.ts:157-159`).
- Cierre de sesión sin red: queda en `tms.pending_logout` y se reenvía (`auth/session.ts:162-171`).
- Al entrar otro chofer se borran outbox y cola GPS (`auth/session.ts:34-43`, `db/reset.ts`).

### 8.3 Consentimiento GPS

- Se pide al abrir la app si no hay consentimiento (`lib/use-permissions-gate.ts:19-40`, `index.tsx:165`). "Ahora no"
  lo salta (`consentimiento.tsx:76`).
- **No hay bloqueo duro**: `parada/[id].tsx` no consulta el consentimiento. Al aceptar se envía
  `POST /consentimiento-gps` (`gps/sync.ts:29-34`, `sendConsentIfPending`; `consentimiento.tsx:37` solo vacía la cola de posiciones). El GPS no arranca sin consentimiento (`gps/use-gps.ts:58`), pero la parada no lo consulta.
- El backend tampoco lo exige (§4.9).

### 8.4 Outbox offline (`sync/outbox.ts`, `db/outbox.ts`)

- Tipos: `transition`, `incident`, `return`, `evidence` (`db/outbox.ts:4`). Las posiciones **no** van por el outbox:
  van por la cola GPS (`db/positions.ts`, `gps/sync.ts`).
- **FIFO estricto**: recorre en orden de creación y se detiene en el primer ítem con reintento pendiente
  (`outbox.ts:170-172`). Un 5xx, un 401 o un corte de red bloquean toda la cola hasta el backoff (`outbox.ts:191-197`).
- Dependencias: cada ítem depende del último no terminado de la **misma parada** (`outbox.ts:28, 39`). Si el padre
  queda `failed`, los hijos pasan a `failed` con `depends_failed` (`outbox.ts:173-177`) y la UI no les permite reintentar
  (`parada/[id].tsx:183`). Para resetearlos hay que reintentar el padre (`outbox.ts:136-138`).
- Errores: 4xx distinto de 401 → `failed` (y sigue con el siguiente, `outbox.ts:187-190`). 5xx, 401, red → reintento con
  backoff de 1 s · 2^n, tope 5 min, con jitter entre la mitad y el total del intervalo (`gps/policy.ts:85-88`).
- Disparadores: cada 10 s si hay pendientes (`sync/use-outbox.ts:24`), al volver a primer plano, al encolar, al
  reconectar. Purga de terminados de más de 1 día (`outbox.ts:200`).
- `client_id`: transición y novedad usan el id del ítem (`outbox.ts:31-38`); la evidencia tiene el suyo (`outbox.ts:95-106`);
  la devolución genera un UUID al encolar (`outbox.ts:90`). El cuerpo queda en SQLite, así que un reenvío es idéntico.

### 8.5 Evidencias y devolución en la app

- Flujo de evidencia (`sync/evidence.ts`): `POST …/evidencias/upload-url` con `kind`, `mime_type`, `client_id`
  (`:63-66`) → POST multipart a S3 con los `fields` firmados y el archivo al final (`:69-81`, timeout 45 s, `:15`)
  → `POST …/evidencias` con `kind`, `key`, `client_id`, `captured_at`, lat/lng (`:93-95`). Borra el archivo local
  tras confirmar (`:97`). Si S3 responde 400/413/415 no reintenta; otros fallos reintentan con URL nueva.
- Tope 5 MB antes de subir (`evidence.ts:13, 61`).
- Foto (`lib/capture.ts:20-40`): cámara sin EXIF, lado mayor 1600 px, JPEG calidad 0,75, copia a carpeta privada.
  La foto de producto usa la misma función (`:43`). Firma en PNG (`:46-49`).
- Tipo de parada: `stop.type === 'collection'`; si falta, entrega (`api/tracking.ts:122`, `:12-13`).
  - entrega: `photo_invoice` + `signature` (`parada/[id].tsx:110, 119`);
  - recolecta: `photo_product` + `signature`; la firma es el mismo `kind: 'signature'` (`firma.tsx:31`).
- Transición (`sync/outbox.ts:48-61`): `to` ∈ `delivered` | `failed`; extras `receiver_name`, `reason`, `reason_code`,
  `type` (solo recolecta, `parada/[id].tsx:105`). La entrega lejos del punto envía `reason_code` (lista en
  `parada/[id].tsx:18, 249-250`); umbral 150 m (`lib/geo.ts:5, 18-23`); no envía `distance_m` (el servidor lo calcula).
- **Validación del cliente**: entregar sin ubicación del teléfono bloquea (`parada/[id].tsx:108, 222-223, 244`).
  La app **no interpreta** los códigos de error del servidor (`outside_geofence`, `location_required`,
  `evidence_required`, `route_closed`, `trip_in_progress`): solo guarda el mensaje en `last_error` (`outbox.ts:188`); la pantalla muestra un texto genérico (`parada/[id].tsx:176-181`).

### 8.6 Devolución en la app (`components/return-button.tsx`, `lib/return-form.ts`)

- Validación (`lib/return-form.ts:42-44`): parada, al menos un artículo, motivo y foto.
- Motivos (`RETURN_REASONS`, `return-form.ts:6-11`): texto en español (p. ej. "Producto dañado"), **no código**.
- Cantidad: tope = cantidad de la línea del pedido (`return-form.ts:20-23`, `return-button.tsx:172-174`).
  **Los artículos manuales no tienen tope** (`return-button.tsx:190`): no hay validación contra el pedido
  (pendiente [devoluciones/03](../devoluciones/pendientes/03-validar-cantidad-contra-pedido.md)).
- Payload final (`outbox.ts:85-91`, `return-form.ts:26-34`): `{items: [{product_code, product_name, quantity}], reason,
  notes?, photo_client_id?, client_id}`.

### 8.7 GPS en el teléfono (`gps/`)

- Muestreo (`gps/policy.ts:31-35`): en movimiento cada 30 s o 25 m; detenido 180 s / 50 m; batería baja 120 s / 100 m.
  El "60 s" es solo el `deferredUpdatesInterval` del sistema operativo (`policy.ts:32`).
- Envío de la app: cada 150 s o cada 20 puntos (`policy.ts:11-12`), tope 200 por lote (`policy.ts:13`).
  El documento de flujo menciona 150 s; coincide.
- Filtros del teléfono (`policy.ts:49-64`): descarta precisión > 100 m, intervalo < 10 s y velocidad > 90 m/s.
  **No descarta `is_mock`**: lo envía marcado y el servidor no lo usa para mover el camión (`gps/task.ts:50, 99`).
- Segundo plano: tarea `tms-gps` (`gps/task.ts:113-123`) con servicio en primer plano y notificación (`task.ts:61-65`).
  Sin build nativo o sin permiso "siempre", cae a `watchPositionAsync` con la app abierta (`task.ts:188-199`).
- Pausa/reanudación: sin viaje en tránsito se detiene (`task.ts:207-212`). Al cerrar sesión se detiene, pero la cola
  de posiciones se conserva (`gps/sync.ts:66-67`) y sale al volver a entrar. El GPS se detiene al cerrar sesión en `app/_layout.tsx:58-61`.
- Envío (`gps/sync.ts:42-93`): un 400 divide el lote para aislar el punto malo; "viaje no activo" corta el GPS del viaje
  (`:78-81`).
- **Permisos encadenados** (`lib/permissions.ts:37-41`): cámara → ubicación en primer plano (`gps/task.ts:147`) →
  notificaciones (Android 13+, `task.ts:150-152`) → ubicación "siempre" (`task.ts:154`; abre Ajustes en Android 11+).

### 8.8 Presencia (`sync/presence.ts`)

Heartbeat `POST /presencia/heartbeat` con `device_id`, `battery_pct`, `occurred_at` (`presence.ts:30-37`), cada 90 s
mientras haya sesión (`:16, 40-53`), también al abrir, al volver al frente y al reconectar.

### 8.9 Configuración

`config.ts:10-24`: la URL base sale de `EXPO_PUBLIC_API_BASE`; si no, el origen web, luego la IP del servidor de Expo,
y por último `http://localhost:4100`. Sin secretos en el archivo.

### 8.10 Lo que dice `PENDIENTES_BACKEND.md` y su estado real

| Ítem del pendiente | Estado según el código |
|---|---|
| Aplicar `m08` y desplegar (L27-28) | Pendiente (Intelix) |
| `photo_product` en `upload-url` y `evidencias` (L14-15) | **Hecho en código** (`logic.py:44`) |
| `transicion` acepta `type: 'collection'` (L17-19) | **Hecho en código** (`stops.py:46`, `REQUIRED_EVIDENCE`) |
| `mi-viaje` con `type` por parada (L13) | **Hecho en código** (`trips.py`, `"type": logic.stop_type(...)`). El pendiente parece desactualizado |
| `POST devoluciones` con `items[]` y foto (L23-25) | **Hecho en código** (`stops.py:193-238`). Falta el despliegue |
| `GET /paradas/{id}/articulos` (L26) | **Hecho en código** (`stops.py:181-190`) |
| Recolecta real de Planificación (`stop_type`) (L7-10) | Pendiente (`m05`; nadie fija `collection`) |

---

## 9. Datos de prueba (mock) y usuarios

Hay **dos** mocks distintos:

1. **Mock de la web** (`src/pages/tracking/mock/`, `scripts/`): backend simulado en memoria con el mismo contrato, solo
   en desarrollo. Detalle en [modo-mock.md](./modo-mock.md) (escenarios `VJ-DEMO-CR-01…07`, `VN-01…03`, completados).
   El estado del mock **no persiste** al recargar.
2. **Data mock de BD** (`scripts/mock-tarifas/flujo.ts`, `cargar.mjs`): datos en Aurora compartidos entre Tracking,
   Devoluciones y Liquidaciones. Fuente: `docs/tarifador/demo-data/MOCK_FLUJO_3_MODULOS.md`.
   - Usuarios de chofer: `chofer.mock-1@demo.tms.local` (Costa Rica MOCK) y `chofer.mock-2@demo.tms.local` (Venezuela MOCK)
     (`flujo.ts:180`, `MOCK_FLUJO_3_MODULOS.md:11-12`). La clave no está en el repo (`MOCK_USER_PASSWORD`).
   - Dos viajes **`En tránsito`** con posición reciente y chofer en línea: `R-20261009-06-05` (CR) y
     `VE-20261008-ZUL-17` (VE) (los códigos vienen del JSON de la mock, no de `flujo.ts`; doc líneas 11-12 y 35).
   - Posiciones fechadas **al momento de cargar** (`@NOW-<n>m` del JSON; doc línea 45).
   - Recorrido de 10 viajes: 511 posiciones, 99 visitas, 132 eventos (doc línea 41).
   - **Sin fotos ni firmas reales**: `photo_url` queda vacío (doc línea 49; el `flujo.ts:161` citado no está verificado).
   - La mock **no aplica `m08`**: las devoluciones contracamión desde la app no tienen foto (doc línea 48).
   - Al entregar la última parada el viaje pasa a `Completada` (doc línea 35), coherente con el cierre del móvil (§4.5).
   - Operar la mock la modifica; se restaura con `cargar.mjs --reset --execute`.

---

## 10. Observaciones, precauciones y contradicciones

1. **Zona horaria.** `days_late`, "completados hoy" y `CLIENT_PLANNED` usan `countries.timezone`
   (`tracking_logic.py:303-312`; `app.py:349-352`). Donde falta la zona hay respaldos distintos: la web usa UTC
   (`'UTC'` en `app.py:350`), y la app y `CLIENT_PLANNED_SQL` usan `America/Costa_Rica`. Un país sin zona puede dar
   resultados diferentes según la vía.
2. **Consentimiento GPS no bloqueante.** La app lo pide y el backend lo registra, pero no exige el consentimiento para
   aceptar posiciones ni para operar paradas. Es una decisión de producto que hay que confirmar.
3. **Mock-location.** Las posiciones con `is_mock` se guardan pero no mueven el camión ni se usan para la visita
   (`positions_usable`, `logic.py:247-249`). **La app no las descarta** (§8.7): el filtro lo hace el servidor.
4. **Orden del outbox.** FIFO estricto por creación: un 5xx o un 401 bloquean toda la cola, no solo la parada.
   Una parada con un ítem `failed` deja a sus hijos `depends_failed` sin botón de reintento (§8.4).
5. **Idempotencia.** Posiciones (`client_id` en `tbl_tracking_positions`), eventos (`client_id` en `tbl_tracking_events`),
   evidencias (llave S3 con `client_id`), devoluciones (`return_number` con `client_id`), consentimiento (`app_user_id` +
   `version`). Reenviar desde la cola offline no duplica.
6. **Rol Cliente recibe 403** en todos los endpoints de tracking excepto `mis-entregas` (`app.py:141-148`). La web
   muestra `MisEntregas` según el rol (`page.tsx:32`).
7. **Entrega sin ubicación.** El móvil la bloquea (`stops.py:91-93`; `parada/[id].tsx:244`). La documentación de flujo
   (`mobile/.test/flujo-tracking-completo.md`, §3.2) dice que "sin ubicación" se entrega eligiendo motivo; el código no
   lo permite. Prevalece el código.
8. **Dos caminos de ingesta, dos reglas.** Solo el móvil detecta llegadas y salidas de paradas (`positions.py:20-44`).
   Las posiciones enviadas por el backend web (`POST /posiciones`, `app.py:743`) **no** generan `tracking_stop_visits`,
   así que el tiempo en sitio depende de la app del chofer.
9. **Cierre del viaje.** Hay **dos** comportamientos: el móvil cierra con la última parada (`stops.py:116-123`); la web
   no. Además la traducción en inglés dice que "el viaje se cierra solo con la última entrega"
   (`src/i18n/local/en/tracking.ts:63`), lo que solo es cierto desde la app. Y `decisiones.md` §3 dice que `routes.status`
   ya no lo escribe nadie: eso queda desactualizado.
10. **`start_viaje` (web) vs `start.py` (móvil).** El móvil exige transportista y un viaje a la vez; la web no. La
    docstring de `start.py:4-5` dice que el resultado es el mismo; no lo es.
11. **Polling.** `10 s` en código; los documentos que decían 15 s ya se corrigieron (§2.4).
12. **Sedes hardcodeadas.** `CUSTOMER_ORIGINS` y `COUNTRY_ORIGINS` (`tracking_logic.py:143-148`, duplicadas en
    `mobile_api/logic.py:167-172`) son de prueba. Cambiarlas exige tocar **dos** archivos.
13. **Evidencias de devolución en la BD.** Ver §7.5: sin `m08`, la devolución con foto no se completa.
14. **Reglas espejo.** Las constantes de ETA, geocerca, señal y gracia están duplicadas en `tracking_logic.py` y
    `mobile_api/logic.py`. Un cambio en una debe replicarse en la otra.
15. **Mock-location, precisión y geocerca.** La geocerca se mide con la posición del dispositivo al entregar; si el GPS
    tiene > 150 m de error, la entrega exige motivo (`outside_geofence`).

---

## 11. Limitaciones y pendientes

Lista de estado (la fuente de detalle es [pendientes/README.md](./pendientes/README.md)):

| # | Pendiente | Estado |
|---|---|---|
| 01 | Correo de aviso a la siguiente parada | Pendiente por implementar |
| 02 | Aplicar `m06`/`m07` en los demás ambientes y prueba E2E | Pendiente por verificar (Intelix y Aurora) |
| 03 | Vínculo usuario Cliente → punto de entrega (hoy solo por SQL) | Pendiente por implementar |
| 04 | Datos del punto de entrega en los pedidos | Pendiente por verificar |
| 07 | Registro en el task tracker | Pendiente |
| 08 | Mejoras posibles | Ideas |
| 09 | App del chofer: verificar la devolución contracamión | Pendiente por verificar |
| 10 | Auditoría de fricción de la app del chofer | Parcial |
| 11 | Permisos en cadena al primer uso (verificar en teléfono) | Pendiente por verificar |

Además, sin verificar o fuera de este módulo:
- Aplicar `m08` y desplegar `backend/mobile` y `backend/admin`
  ([devoluciones/pendientes/01](../devoluciones/pendientes/01-despliegue-contracamion.md)).
- Recolecta real desde Planificación (`stop_type`), no fijada por nadie hoy (`m05`;
  [devoluciones/pendientes/02](../devoluciones/pendientes/02-flujo-recolecta.md)).
- Validación de cantidad devuelta contra el pedido ([devoluciones/pendientes/03](../devoluciones/pendientes/03-validar-cantidad-contra-pedido.md)).
- Handler de `POST /api/v1/planificacion/viajes/{id}/completar|cancelar|reabrir` (llamado por `src/pages/planificacion/planes-api.ts:125-136`): no existe en ningún backend del repo.
- Sedes de origen reales (no de prueba) y dónde guardarlas (ver §10.12).
- Pruebas: `backend/tests/test_tracking.py`, `backend/mobile/tests/` (`test_stop_visits.py`, `test_driver_api.py`,
  `test_web_contract.py`, `test_start_trip.py`), `src/pages/tracking/__tests__/`, `e2e/tracking.spec.ts` (modo mock),
  `mobile/frontend/src/__tests__/`. Ninguna se ejecutó en esta documentación.
- Mapas: ver [alternativas-mapas.md](./alternativas-mapas.md) (OSRM y tiles públicos, sin SLA).

---

## 12. Mapa de archivos

| Tema | Archivo |
|---|---|
| Ruta y guardas | `src/router/config.tsx:138-141` |
| Página y rol | `src/pages/tracking/page.tsx` |
| Cliente HTTP | `src/pages/tracking/api.ts` |
| Tipos | `src/pages/tracking/types.ts` |
| Reglas de presentación | `src/pages/tracking/tracking-logic.ts` |
| Polling | `src/pages/tracking/hooks/usePolling.ts`, `polling-runner.ts`, `useViajesEnVivo.ts`, `useTrackingCountry.ts` |
| Monitor | `components/ViajesSidebar.tsx`, `ViajeCard.tsx`, `ResumenBar.tsx`, `ViajeDetallePanel.tsx`, `ParadaItem.tsx`, `FlotaMapa.tsx`, `ChoferesEnLinea.tsx` |
| Mapa | `components/map/` (`cluster.ts`, `RutaViaje.tsx`, `TruckMarker.tsx`, `icons.ts`), `route-osrm.ts`, `stop-order.ts` |
| Vista cliente | `components/MisEntregas.tsx`, `MapaEntrega.tsx` |
| Mock web | `src/pages/tracking/mock/` (`sim.ts`, `fakeTrackingBackend.ts`, `installTrackingMock.ts`, `CierrePlanificacion.tsx`), `data/viajes-demo.json` |
| Backend web | `backend/tracking/src/app.py`, `tracking_logic.py`, `tracking_sql.py` |
| Backend móvil | `backend/mobile/src/mobile_api/routes.py`, `auth.py`, `trips.py`, `start.py`, `positions.py`, `stops.py`, `evidence.py`, `presence.py`, `consent.py`, `logic.py`, `sql.py`, `audit.py`, `security.py`, `config.py` |
| Migraciones móvil | `backend/mobile/sql/m01_mobile_base.sql` … `m08_photo_return.sql` |
| Migraciones raíz | `sql/15_matriz_permisos_roles.sql` (permisos), `sql/43_tracking_app_chofer.sql`, `sql/27_tarifas_vista_viajes_un_recorrido.sql` (vista de Liquidaciones), `sql/59_estandar_oltp_renombrado.sql` (renombre a `tbl_*` con vistas de compatibilidad) |
| Devoluciones (lectura) | `backend/admin/src/admin_returns.py`, `admin_returns_sql.py`, `admin_media.py` |
| App del chofer | `mobile/frontend/src/` (`app/`, `sync/`, `db/`, `gps/`, `lib/`, `api/`, `components/return-button.tsx`, `lib/return-form.ts`) |
| Documentación de la app | `mobile/PENDIENTES_BACKEND.md`, `mobile/.test/flujo-tracking-completo.md`, `mobile/.test/pendientes.md` |
| Data mock de BD | `scripts/mock-tarifas/flujo.ts`, `cargar.mjs`, `docs/tarifador/demo-data/MOCK_FLUJO_3_MODULOS.md` |
| Scripts de prueba | `scripts/tracking-contract-check.mjs`, `scripts/simular-posiciones.mjs`, `scripts/seed-tracking-demo.mjs`, `scripts/limpiar-tracking-prueba.mjs`, `backend/mobile/scripts/simular_recorrido.py` |
