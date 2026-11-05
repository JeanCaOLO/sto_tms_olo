# Tracking móvil — presencia, permisos y avisos

## Presencia (en línea / sin señal)

Le dice al monitor web si el chofer tiene la app abierta, **con o sin viaje iniciado**. Tabla `driver_presence` (migración `m03`). Es de **mejor esfuerzo**: un fallo al escribirla se registra pero nunca tumba el login, el logout ni el lote de posiciones (`presence.py`).

### Quién la escribe

| Evento | Efecto | Código |
|---|---|---|
| Login | `online`, `last_event=login` | `presence.mark` |
| Heartbeat | `online`, `last_event=heartbeat` | `POST /presencia/heartbeat` |
| Lote de posiciones | Refresca `last_seen_at` **sin** reactivar a quien ya cerró sesión | `presence.touch` |
| Logout | `offline` con la hora del teléfono | `presence.mark_offline` |

### Heartbeat en la app (`src/sync/presence.ts`)

Al abrir, cada **90 s** (`HEARTBEAT_MS`, bien por debajo de los 5 min) y cada vez que la app vuelve al frente, mientras haya sesión. Envía `device_id`, `battery_pct`, `occurred_at`. **No se encola**: solo importa el último; al volver la red se manda uno nuevo. Con `occurred_at` el servidor acota la hora a "ahora" y no pisa latidos más nuevos.

### Señal calculada (`logic.presence_signal`)

| Señal | Condición |
|---|---|
| `none` | Sin registro |
| `offline` | `status=offline` (logout explícito manda sobre la antigüedad) o último latido > 1800 s |
| `online` | Último latido ≤ 300 s (`PRESENCE_ONLINE_SECONDS`) |
| `stale` | Entre 300 y 1800 s (`PRESENCE_STALE_SECONDS`) |

Mismos umbrales que la señal de posición del monitor web (`tracking_logic.py`).

## Permisos del teléfono

Se piden **en cadena con un solo toque** (`requestAllPermissions`, `lib/permissions.ts`; guarda en `lib/use-permissions-gate.ts`), en este orden: cámara → ubicación «mientras se usa» → notificaciones (solo Android 13+, sin él el servicio corre pero el chofer no ve la notificación) → ubicación «siempre» al final (en Android 11+ abre Ajustes).

- La guarda (`usePermissionsGate`) corre **una vez por apertura de la app**: si falta el consentimiento o algún permiso básico, lleva a `/consentimiento`. Con «Ahora no» no se insiste (queda el aviso del viaje); si no puede leer el estado, no bloquea al chofer.
- Mínimo para trabajar (`permissionsReady`): cámara + ubicación. «Siempre» es deseable pero **no obliga**: sin él el GPS queda `foreground_only`.
- `blocked = true` cuando Android ya no vuelve a mostrar el diálogo (cámara o ubicación con `canAskAgain=false`): solo se arregla en Ajustes.

Android declara ubicación fina, aproximada y en segundo plano, servicio en primer plano y `POST_NOTIFICATIONS` (`app.json`). Falta verificarlo en teléfono: [`../pendientes/11`](../pendientes/11-permisos-primer-uso-verificar.md).

## Avisos al chofer

| Aviso | Qué es |
|---|---|
| Notificación persistente «Viaje en curso» | Requisito del **servicio en primer plano** del GPS (`gps/task.ts`). |
| Vibración de llegada | Una vez por parada a ≤ 150 m (`lib/arrival.ts`). |
| Banner de acciones fallidas | El outbox muestra las acciones rechazadas para rehacerlas. |

## Lo que NO existe

- **Push remoto** (FCM/APNs): no hay `expo-notifications`. Nada del servidor puede avisar al teléfono.
- **Correo de aviso a la siguiente parada**: pendiente [`../pendientes/01`](../pendientes/01-correo-aviso-siguiente-parada.md). Hoy solo hay aviso en pantalla.
- **Recordatorio de factura al llegar**: propuesto en el blueprint, no implementado. Ver [pendientes/04](./pendientes/04-push-remoto.md).
