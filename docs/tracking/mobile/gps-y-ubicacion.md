# Tracking móvil — GPS y ubicación

## Consentimiento

Antes de rastrear, el chofer acepta el consentimiento (`src/app/consentimiento.tsx`). La versión vigente es `CONSENT_VERSION = 'gps-2026-10'` (`src/gps/state.ts:8`); si cambia, se vuelve a pedir. Se guarda local (`sent:false`) y se envía con `POST /consentimiento-gps` (`tbl_tracking_consents`; 201 nuevo, 200 duplicado).

## Captura en el teléfono

Dos modos (`src/gps/task.ts`):

| Modo | Cuándo | Cómo |
|---|---|---|
| **Segundo plano** | Build propio (dev client o app publicada) con permiso de ubicación «siempre» | Tarea `tms-gps` (`expo-task-manager` + `expo-location`) con servicio en primer plano («Viaje en curso», color `#0D9488`), `activityType: AutomotiveNavigation`, `pausesUpdatesAutomatically: false`, indicador de ubicación en segundo plano. Sigue con la pantalla apagada. Se define al cargar el bundle (`_layout.tsx`) porque Android puede despertar la app sin pantallas solo para entregar puntos. |
| **Foreground** | Expo Go, web, o el chofer dio «solo mientras se usa» | `watchPositionAsync` mientras la app está abierta, con la misma cola, filtros y lotes. |

- Disponibilidad (`gpsAvailability`): `ok` (siempre + segundo plano), `foreground_only`, `no_permission`, `unsupported`. `startTracking` solo arranca la tarea con `ok`; si no, la pantalla cae al modo foreground (`startForegroundTracking`).
- Precisión pedida: `High` en movimiento, `Balanced` en detenido/batería baja. **Cambiar de modo** = volver a registrar la tarea con otras opciones (el SO no permite cambiarlas en caliente).
- `setRoute` fija el viaje al que van los puntos; antes de cambiarlo envía lo pendiente del anterior (`flushPositions(true)`).
- `stopTracking` detiene todo, limpia `route_id` y envía lo que quede en la cola.
- Cada punto lleva `accuracy_m`, `speed_mps`, `heading_deg`, `battery_pct` e `is_mock` (`location.mocked`); `client_id` es un UUID nuevo por punto (`expo-crypto`).

## Reglas puras (`src/gps/policy.ts`)

| Constante | Valor | Para qué |
|---|---|---|
| `ACCURACY_MAX_M` | 100 m | Peor precisión se descarta en el teléfono (el servidor tolera hasta 200 m; diferencia intencional, está comentada en el código). |
| `MAX_SPEED_MPS` | 90 | Un salto más rápido es error de GPS. |
| `MIN_GAP_MS` | 10 s | Dos puntos más seguidos no aportan. |
| `SEND_EVERY_MS` | 150 s | Intervalo de envío del lote. |
| `SEND_AT_COUNT` | 20 | Envío anticipado al juntar 20 puntos. |
| `BATCH_MAX` | 200 | Límite del servidor. |
| `MOVING_MPS` | 2 | Umbral de «en movimiento». |
| `STOPPED_AFTER_MS` | 3 min | Sin superar `MOVING_MPS` → «detenido». |
| `LOW_BATTERY_PCT` | 20 | Bajo esto → modo ahorro. |

`filterFixes` ordena por hora y descarta: coordenadas no finitas, imprecisos, demasiado seguidos y saltos imposibles (`policy.ts:49`).

### Modos de muestreo (`MODE_OPTIONS`)

| Modo | `timeInterval` | `distanceInterval` |
|---|---|---|
| `moving` | 30 s | 25 m |
| `stopped` | 180 s | 50 m |
| `low_battery` | 120 s | 100 m |

`nextMode`: batería baja manda; si no, `stopped` tras 3 min sin movimiento.

### Por qué lotes

La web pinta «en línea» si el último punto tiene ≤ 300 s. Con lote cada ~150 s son ~24 llamadas/hora por chofer en vez de ~120.

## Envío (`src/gps/sync.ts`)

1. Los puntos filtrados van a `position_queue` (SQLite; PK `client_id` UUID) y se persiste el último punto aceptado, la hora del último movimiento y el modo (`gps/state.ts`).
2. Se envían en lotes (`shouldSend`: hay pendientes y pasaron 150 s, o ya hay 20). `flushPositions(true)` fuerza el envío.
3. El primer envío con sesión manda también el **consentimiento pendiente** (`sendConsentIfPending`).
4. Reintentos con espera exponencial con jitter: 1 s, 2 s, 4 s… hasta 5 min (`backoffMs`); `attempt`, `next_try_at` y `last_error` (`HTTP <status>` o `network`) se guardan en el estado GPS.
5. Un **400** de lote malformado se **parte a la mitad** recursivamente hasta aislar el punto malo; solo ese se descarta (queda `last_error`). Otros errores no parten el lote.
6. Un 2xx saca de la cola todos los puntos del lote (aceptados, duplicados o rechazados para siempre).
7. Si `rejected` trae «viaje no activo» o «viaje no encontrado» para el `route_id` actual, se limpia `route_id` y se deja de encolar; la tarea se detiene al refrescar la agenda.
8. Sin sesión la cola se conserva y se envía al volver a entrar.
9. Cada despertar del GPS aprovecha para vaciar también el **outbox** (`flushOutbox`).

## Reglas del servidor (`positions.py`, `logic.py`)

- Todo el lote va en **una transacción**; idempotente por `client_id` (`ON CONFLICT DO NOTHING`).
- Solo viajes **del conductor**; uno ajeno es «viaje no encontrado».
- Viaje activo, o cerrado hace ≤ 2 h (`GRACE_AFTER_CLOSE`): los puntos tardíos entran.
- **Punto no usable** (`is_mock` o precisión > 200 m, `ACCURACY_MAX_M` del servidor): se guarda, pero no mueve la última posición ni entra al recorrido.
- Solo un punto **nuevo, usable y de viaje activo** actualiza `tbl_tracking_last_positions`.
- **Salida de la sede:** la primera posición usable a > 300 m de la sede (`DEPARTURE_RADIUS_M`) fija `routes.departed_at` una sola vez. Origen = sede de la empresa (`CUSTOMER_ORIGINS`) > coordenadas de la tienda de origen > sede del país (`logic.origin_coords`).
- **Visitas a paradas** (`detect_visits`): llegada a ≤ 150 m, salida a > 200 m (histéresis para el ruido del borde), mínimo 60 s en una parada aún pendiente (menos es «pasar de largo»); una parada ya cerrada solo acepta puntos anteriores a su cierre. Alimenta `tbl_tracking_stop_visits`.
- La respuesta incluye `rejected[]` con la razón por punto.
- El lote también refresca la **presencia** (`presence.touch`).

## ETA y retraso

`stop_metrics` encadena las paradas pendientes en orden de `sequence` desde la posición actual: línea recta × 1,35 a 30 km/h + 5 min de servicio por parada. Mismas constantes que el monitor web (`backend/tracking/src/tracking_logic.py`).

## Aviso de llegada en la app

`src/lib/arrival.ts`: cada 20 s (`ARRIVAL_POLL_MS`) se renueva la ubicación en la pantalla principal; la parada pendiente más cercana a ≤ 150 m dispara **una** vibración por parada (`feedback.ok`) y deja el aviso hasta que el chofer la abra o lo descarte. No hay recordatorio de factura (el blueprint lo proponía; no está implementado en este archivo).
