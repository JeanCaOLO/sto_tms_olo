# Contrato `/api/v1/tracking` v2 (monitoreo)

Fuente única para `backend/tracking`, el backend simulado (`src/pages/tracking/mock/`) y la app móvil. Los tipos de la web están en `src/pages/tracking/types.ts`.

**Sobre de respuesta:** éxito `{ "data": ... }`; error `{ "error": { "message": "..." } }` con 400 / 401 / 403 / 404 / 409 / 422. La web traduce el error por **código** (claves `tracking.error*`), no por el texto.

**Compresión:** si la petición trae `Accept-Encoding: gzip` y el cuerpo pasa de 1 KB, la respuesta va comprimida (`Content-Encoding: gzip`).

## Lectura (web)

### `GET /viajes?activos=1&q=&limit=30&cursor=&pais=CR&include=summary`
- `activos=1`: solo en tránsito. Sin él: todos, recientes primero.
- `q`: busca en número de viaje, conductor y placa.
- `limit`: 1 a 100 (por defecto 30). `cursor`: el `next_cursor` de la página anterior.
- `pais`: código de `countries.code` (CR, VN…). Se **intersecta** con los países del rol (nunca los amplía). Código mal formado: 400.
- `include=summary`: agrega los KPIs. Solo en la primera página (sin `cursor`).

Respuesta: `{ items: Viaje[], next_cursor: string | null, summary?: Resumen }`.

**Viaje**

| Campo | Tipo / valores |
|---|---|
| `id`, `route_number` | texto |
| `state` | `planned` · `active` · `completed` · `cancelled` · `unknown` |
| `phase` | `por_salir` · `en_ruta` · `null` (no activo) |
| `signal` | `online` · `stale` · `offline` · `none` (nunca hubo GPS) |
| `color` | `green` · `amber` · `gray` · `blue` (completado) |
| `driver_name`, `plate`, `zone_name` | texto o null |
| `country`, `timezone` | ISO del país e IANA (`America/Costa_Rica`): las horas se muestran en la del viaje |
| `started_at`, `ended_at`, `planned_end_at`, `route_date` | ISO o null |
| `position` | `{ lat, lng, speed_mps, recorded_at }` o null |
| `progress` | `{ total, done, delivered, failed, percent }` (fallidas cuentan como cerradas) |
| `delay_min` | minutos de retraso contra la siguiente parada, o null |
| `alerts` | `{ code, count? }[]`, `code` ∈ `failed` · `no_signal` · `late` · `stopped` |

**Resumen** (por VIAJES): `{ active, on_time, late, no_signal, completed_today }`. `on_time = active − late`. `completed_today`: completados cuyo `actual_end_time` cae hoy en la zona del país.

### `GET /viajes/{id}`
Viaje + `{ origin: { lat, lng, name } | null, next_stop_id, departed_at, stops: Stop[] }`.

**Stop:** `id, guide_number, sequence, state (pending|delivered|failed), order_number, invoice_number, customer_name, address, city, lat, lng, arrived_at, recipient_name, evidences, planned_arrival_at, distance_m, eta_at, delay_min`.
- `evidences`: `{ id, kind: photo_invoice | signature, mime_type, captured_at, url }[]`. `url` firmada, estable ~1 h (se puede cachear en el navegador).
- `next_stop_id`: la siguiente **pendiente por secuencia**.
- `departed_at`: primera salida de la sede (> 300 m), leída de `routes.departed_at` (columna de `sql/44`).
- La app del chofer (rol Chofer) recibe además `customer_phone`, `items`, `weight` y no recibe URLs de evidencias.

### `GET /viajes/{id}/recorrido` (bajo demanda, para el replay)
`{ points: { lat, lng, at }[] }`: rastro completo, cronológico, sin puntos simulados (`is_mock`) ni imprecisos (`accuracy_m > 200`), simplificado (Douglas-Peucker ~15 m, tope 2000 puntos).

## Reglas (una sola fuente: `backend/tracking/src/tracking_logic.py`)

| Regla | Valor |
|---|---|
| Señal | `online` ≤ 5 min · `stale` ≤ 30 min · `offline` después · `none` si nunca hubo posición (umbrales amplios por la cobertura móvil irregular) |
| Color en mapa | verde online · ámbar stale · gris offline/none · azul completado |
| `late` | retraso > 15 min = ETA a la siguiente parada pendiente (por secuencia) − su hora planificada. Igual en lista y detalle. Sin posición, o con la señal caducada (`offline`), no hay ETA ni `late` (`distance_m`/`eta_at`/`delay_min` = null): el aviso es `no_signal`, no un retraso de días. |
| `stopped` | ≥ 20 min sin moverse más de 75 m (ventana de 60 min de posiciones), solo con señal online |
| `no_signal` | solo si hubo señal y caducó (`offline`); `none` no alerta |
| `failed` | alguna parada fallida |
| ETA | línea recta × 1,35 a 30 km/h + 5 min por parada (igual que Planificación) |

La web **no** tiene umbrales propios: pinta `signal`, `color` y `alerts` tal como llegan.

## Solo modo mock en la web (el backend los mantiene)
- `GET /planificados?pais=` — viajes de planes confirmados sin iniciar.
- `POST /viajes/{id}/iniciar` (`id` = `plan_trip_id`) — puente plan → viaje; idempotente (`created: false` si ya existía, también en concurrencia).

## Escritura (app del chofer)
- `POST /posiciones` — lote ≤ 200, idempotente por `client_id`. Acepta puntos hasta 2 h después de cerrar el viaje (se guardan, no mueven la última posición). `is_mock` / `accuracy_m > 200` se guardan marcados y no mueven el camión.
- `POST /paradas/{id}/transicion` — `pending | delivered | failed` (fallida exige motivo). Entrega fuera de la geocerca de 150 m: evento `geofence_out`.
- `POST /paradas/{id}/evidencias/upload-url` y `POST /paradas/{id}/evidencias` — solo `photo_invoice` y `signature` (`photo_other` → 422).

## Cierre del viaje
**Tracking no termina viajes.** El viaje lo termina **Planificación** (completar o cancelar el viaje en `plan_trips`). Tracking solo **lee** ese estado, sin escribir en Planificación:
- `status` del viaje = `Completada` si `plan_trips.status = 'completed'`, `Anulada` si `'cancelled'`; si no, el de `routes`.
- `ended_at` = `routes.actual_end_time` o, si lo cerró Planificación, `plan_trips.updated_at`.
- "Activos" y los KPIs excluyen los viajes terminados en Planificación; "Completados hoy" los cuenta.
- Cerrar la última parada **no** cierra el viaje: queda "Sin paradas pendientes · se cierra desde Planificación".
- La app puede seguir enviando posiciones y cerrando paradas de un viaje ya terminado en Planificación (no se pierden datos); simplemente ya no se muestra como activo.

El cierre automático (con la última parada) y la sincronización de estados entre módulos quedan **pendientes**: ver [pendientes-tunel.md](./pendientes-tunel.md#pendiente-cierre-automático-y-sincronización-entre-módulos).

## Retirado en v2
`POST /paradas/{id}/novedades`, `POST /paradas/{id}/devoluciones`, filtro `por_revisar`, campos `review`, `incidents`, `status_raw`, `carrier_name`, `capacity_percentage`, `total_distance_km`, `events`, `trail`. `GET /resumen` queda deprecado (devuelve la forma de `summary`; la web no lo usa).

**Eliminados el 2026-10-17** (Tracking solo monitorea; responden 404):
- `POST /viajes/{id}/completar` — completaba el viaje a mano desde la web (con `force` si quedaban paradas abiertas). Reemplazo: el viaje se termina en **Planificación** (`/planificacion/viajes/{tripId}/completar|cancelar`, FR7) y Tracking lo refleja (arriba).
- `POST /viajes/{id}/revisar` — marcaba un viaje completado como revisado (quién, cuándo, nota) en `tracking_reviews`. La tabla (`sql/42_tracking_revisiones.sql`) **se conserva** con sus datos, sin uso; si se retoma la revisión, la lógica estaba en `backend/tracking/src/app.py` (`review_viaje`) en el commit `ad8fe25`.
