# Tracking móvil — contrato `/api/mobile/v1`

Fuente: `backend/mobile/src/mobile_api/routes.py:16-37` y los módulos que cada ruta llama. El contrato **web** vive en [`../contrato-api-v2.md`](../contrato-api-v2.md) y no se repite aquí.

## Convenciones

- Base: `/api/mobile/v1`. JSON UTF-8.
- Respuesta correcta: `{ "data": {...}, "error": null }`. Error: `{ "data": null, "error": { "message", "code" } }`.
- Todo lo privado exige `Authorization: Bearer <access_token>`. Rutas públicas: `salud`, `auth/login`, `auth/refresh`, `auth/logout`.
- El usuario debe tener rol `Chofer` (`DRIVER_ROLE_NAME`) y estar enlazado a un conductor (`drivers.app_user_id`).
- Una parada o viaje de **otro** conductor/organización responde **404** (no se revela que existe).
- **Idempotencia:** los UUID `client_id` generados en el teléfono evitan duplicados al reenviar desde la cola offline.
- Fechas ISO 8601. Una hora del teléfono adelantada se acota a "ahora" (hasta 1 día de adelanto); más que eso se rechaza (`logic.clamp_to_now`).
- Las escrituras (todo menos `GET`) fijan el actor para la auditoría de BD (`routes.py:81`).

## Endpoints

| Método y ruta | Handler | Éxito |
|---|---|---|
| `GET /salud` | `routes.py` | 200 `{status:"ok"}` |
| `POST /auth/login` | `auth.login` | 200 sesión |
| `POST /auth/refresh` | `auth.refresh` | 200 sesión nueva |
| `POST /auth/logout` | `auth.logout` | 200 `{ok:true}` |
| `GET /mi-viaje` | `trips.my_trips` | 200 `{items:[…]}` |
| `POST /viajes/{id}/iniciar` | `start.start_trip` | 201 creado / 200 ya existía |
| `POST /posiciones` | `positions.ingest_positions` | 200 `{accepted, duplicates, rejected[]}` |
| `POST /presencia/heartbeat` | `presence.heartbeat` | 200 `{status, seen_at}` |
| `POST /consentimiento-gps` | `consent.record_consent` | 201 nuevo / 200 duplicado |
| `POST /paradas/{id}/transicion` | `stops.transition_stop` | 200 |
| `POST /paradas/{id}/novedades` | `stops.add_incident` | 201 / 200 si duplicado |
| `GET /paradas/{id}/articulos` | `stops.list_items` | 200 |
| `POST /paradas/{id}/devoluciones` | `stops.add_return` | 201 / 200 si duplicado |
| `POST /paradas/{id}/evidencias/upload-url` | `evidence.upload_url` | 200 formulario S3 |
| `POST /paradas/{id}/evidencias` | `evidence.confirm` | 201 |

## Auth

### `POST /auth/login`
Body `{ email, password, device_id? }` (`device_id` máx. 100 caracteres). Respuesta:
```json
{ "access_token": "…", "refresh_token": "…", "token_type": "bearer", "expires_in": 3600,
  "user": { "id": "…", "email": "…" }, "driver": { "id": "…", "name": "…" } }
```
Marca al chofer **en línea**. Errores: 400 faltan campos · 401 `invalid_credentials` · 403 `inactive_user` / `not_a_driver` / `no_organization` · 429 `too_many_attempts`.

### `POST /auth/refresh`
Body `{ refresh_token, device_id? }`. Rotación: el token usado se revoca. Errores 401 `invalid_refresh`. Detalle de reuso en [autenticacion-y-sesion.md](./autenticacion-y-sesion.md).

### `POST /auth/logout`
Body `{ refresh_token, occurred_at? }`. Idempotente (token desconocido no es error). Marca **offline** con la hora `occurred_at` del teléfono, sin pisar un login posterior.

## Viaje

### `GET /mi-viaje`
Devuelve **un solo** elemento en `items` (`trips._current`): el primero con paradas por entregar; con todo hecho, el último terminado. Dos tipos de elemento:

- `kind: "route"` (viaje en tránsito): `id`, `route_id`, `route_number`, `state:"active"`, `phase` (`en_ruta` | `por_salir`), `plate`, `zone_name`, `route_date`, `assigned_at`, `started_at`, `planned_end_at`, `driver_name`, `origin {lat,lng}|null`, `progress {total, done, delivered, failed, remaining, percent}`, `next_stop_id`, `delay_min`, `position {lat,lng,recorded_at}|null`, `stops[]`.
- `kind: "planned"` (plan confirmado de hoy, por iniciar): `id` = `plan_trip_id`, `route_id: null`, `state:"planned"`, `plan_date`, `zone_name`, `plate`, `progress`, `stops[]`.

Parada (`stops[]`): `id`, `guide_number`, `sequence`, `state` (`pending|delivered|failed`), `type` (`delivery|collection`), `order_number`, `invoice_number`, `customer_name`, `company_name`, `customer_phone`, `address`, `city`, `items`, `weight`, `lat`, `lng`, `recipient_name`, `arrived_at`, `evidence_kinds[]`, `planned_arrival_at`, `distance_m`, `eta_at`, `delay_min`. En un plan sin iniciar solo vienen los datos del pedido (sin ETA ni evidencias).

### `POST /viajes/{id}/iniciar`
`{id}` = `plan_trip_id`. Sin body. Crea `routes` + `dispatch_guides` + evento `route_started`, con horas planificadas medidas desde ahora (`logic.plan_schedule`). Idempotente: si ya existe la ruta devuelve la misma con 200. Respuesta `{ route_id, created, route_number? }`. Errores 409:

| `code` | Cuándo |
|---|---|
| `no_carrier` | El viaje no tiene transportista (ni en el chofer ni en el camión). |
| `trip_in_progress` | El chofer ya tiene otro viaje sin terminar. |
| — | Plan no confirmado · viaje ya no `pending` · sin paradas · sin tienda de origen para el país. |

## GPS y presencia

### `POST /posiciones`
```json
{ "device_id": "…", "positions": [
  { "client_id": "uuid", "route_id": "uuid", "lat": 9.99, "lng": -84.26, "recorded_at": "…",
    "accuracy_m": 12, "speed_mps": 8, "heading_deg": 90, "battery_pct": 80, "is_mock": false } ] }
```
Máximo **200** por lote (400 si más). Validación por punto (`logic.validate_position`); los inválidos van a `rejected[{client_id, reason}]` sin tumbar el lote. Razones de servidor: `viaje no encontrado`, `viaje no activo` (se acepta hasta 2 h después de cerrar). Respuesta `{ accepted, duplicates, rejected[] }`. Reglas completas en [gps-y-ubicacion.md](./gps-y-ubicacion.md).

### `POST /presencia/heartbeat`
`{ device_id?, battery_pct?, occurred_at? }` → `{ status:"online", seen_at }`. Detalle en [presencia-y-notificaciones.md](./presencia-y-notificaciones.md).

### `POST /consentimiento-gps`
`{ version, device_id }`. 201 si es nuevo, 200 si duplicado.

## Paradas

### `POST /paradas/{id}/transicion`
`{ to: "delivered"|"failed", occurred_at?, lat?, lng?, receiver_name?, reason?, reason_code?, type?, client_id? }`

Respuesta: `{ stop_id, state, done, pending, distance_m, route_closed }`.

| Condición | Resultado |
|---|---|
| `to="pending"` | 403 `revert_not_allowed` |
| `to` inválido / `type` inválido / `reason_code` inválido | 400 |
| `failed` sin `reason` | 400 |
| `reason_code="otro"` sin texto | 400 |
| `delivered` sin `lat`/`lng` | 400 `location_required` |
| `delivered` a > 150 m sin motivo | 400 `outside_geofence` |
| Faltan evidencias requeridas | 400 `evidence_required` |
| Viaje no en tránsito | 409 (salvo reenvío de la última parada ya registrada: 200 con `route_closed:true`) |

`reason_code` válidos (`logic.FAR_REASON_CODES`): `cliente_pidio_otro_punto`, `acceso_bloqueado`, `sin_estacionamiento`, `zona_insegura`, `gps_impreciso`, `otro`. Con motivo y fuera de geocerca queda además el evento `geofence_out`. Reglas en [viaje-y-paradas.md](./viaje-y-paradas.md).

### `POST /paradas/{id}/novedades`
`{ description, kind?: "incident"|"pickup", lat?, lng?, client_id? }` → `{ stop_id, duplicate }`. 400 sin descripción; 409 si el viaje no está en tránsito.

### `GET /paradas/{id}/articulos`
`{ stop_id, items:[{ line_number, product_code, product_name, quantity }] }`. 409 si el viaje no está en tránsito.

### `POST /paradas/{id}/devoluciones`
`{ items:[{ product_code?, product_name, quantity }], reason, notes?, photo_key | photo_client_id, client_id }` → `{ return_id, return_ids[], duplicate }`. Detalle en [evidencias-y-devoluciones.md](./evidencias-y-devoluciones.md).

### Evidencias
- `POST /paradas/{id}/evidencias/upload-url` `{ kind, mime_type, client_id? }` → `{ url, fields, key, kind, max_bytes }`.
- `POST /paradas/{id}/evidencias` `{ kind, key, client_id, captured_at?, lat?, lng? }` → `{ evidence_id, duplicate }`.

## Errores comunes

| HTTP | `code` | Significado |
|---|---|---|
| 401 | `no_token`, `invalid_token` | Falta o es inválido el token. |
| 401 | `token_expired` | Vencido: la app debe refrescar. |
| 401 | `invalid_refresh` | Refresh inválido, vencido o reusado. |
| 403 | `inactive_user`, `not_a_driver`, `no_organization` | Usuario no habilitado. |
| 404 | — | Ruta no soportada, o parada/viaje que no es del chofer. |
| 429 | `too_many_attempts` | Freno de login. |
| 500 | — | Error interno (el detalle queda solo en CloudWatch). |
