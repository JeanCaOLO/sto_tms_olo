# Tracking móvil — offline y sincronización

La app debe poder usarse sin señal: todo se guarda en SQLite y sale cuando hay red. Esquema en `src/db/kv.ts`.

## Tablas locales

| Tabla | Para qué |
|---|---|
| `kv` | Pares clave/valor (consentimiento, `device_id`, último punto, `route_id`…). WAL activado. |
| `position_queue` | Puntos GPS pendientes. PK `client_id`; índice por `recorded_at`. Ver [gps-y-ubicacion.md](./gps-y-ubicacion.md). |
| `outbox` | Acciones del chofer: `id`, `route_id`, `stop_id`, `kind`, `path`, `body`, `depends_on`, `status`, `attempts`, `next_try_at`, `last_error`, `created_at`. Índice por `(status, created_at)`. |

## Outbox (`src/sync/outbox.ts`)

Tipos de acción (`kind`): `transition`, `incident`, `return`, `evidence`.

- **FIFO por viaje, con dependencias.** Al encolar, la acción queda `depends_on` la última pendiente **de la misma parada**. Así la evidencia sube antes de la transición, y la foto de una devolución antes de la devolución.
- **Idempotencia.** `transition` e `incident` agregan `client_id = id de la acción`; la devolución genera su propio `client_id`; la evidencia usa el `client_id` como llave S3 fija. Reenviar nunca duplica.
- **Estados:** `pending` → `done` | `failed`.
- **Errores 4xx** (salvo 401): la acción queda `failed` con el mensaje; la UI lo muestra y el chofer puede reintentar (`retryOutboxItem`). Las que dependían de ella pasan a `failed` con `last_error='depends_failed'`, y se reactivan juntas al reintentar.
- **Errores de red / 5xx / 401:** `attempts+1`, `next_try_at` con `backoffMs` (1 s … 5 min con jitter), y **se detiene la pasada** para respetar el orden.
- **Una sola ejecución a la vez** (`flushOutbox`); si se encola algo durante una pasada, esa pasada da otra vuelta.
- **Limpieza:** las `done` de más de 24 h se purgan (`purgeDoneOutbox`).
- Al confirmar acciones se notifica a los suscriptores (`onOutboxSent`) para que la agenda se vuelva a pedir.

## Vista optimista

`withPendingActions` aplica sobre la agenda las transiciones y evidencias aún no confirmadas: el chofer ve «Entregado», el progreso y la siguiente parada al instante, aunque el servidor todavía no lo sepa.

## Reconexión (`src/sync/connectivity.ts`)

`startConnectivity` escucha `expo-network`; `onReconnect` avisa solo en la transición **sin internet → con internet**. Un `undefined` del sistema cuenta como conectado: solo un «no» explícito es sin red. Al reconectar se salta la espera de reintento (`retryOutboxNow` → `resetOutboxBackoff`) y se vacían de inmediato el outbox, la cola GPS y el cierre de sesión pendiente.

A propósito **no** se conecta con `onlineManager` de TanStack Query: con la red caída pausaría las consultas y la agenda guardada en el teléfono (`my-trips.ts`) no llegaría a mostrarse.

## Presencia

Los latidos **no** se encolan: solo importa el último (`sync/presence.ts`).

## Cambio de chofer

`db/reset.ts` borra las colas si entra un conductor distinto; ver [autenticacion-y-sesion.md](./autenticacion-y-sesion.md).

## Qué ve el servidor cuando se reenvía tarde

- Transición de la última parada ya registrada, viaje cerrado: 200 con `route_closed:true` (no es error).
- Puntos GPS de un viaje cerrado hace ≤ 2 h: se aceptan.
- Logout y latidos con `occurred_at` viejo no pisan eventos más nuevos.
