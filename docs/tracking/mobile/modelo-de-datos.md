# Tracking móvil — modelo de datos

Base `tms_olo` (PostgreSQL / Aurora), esquema `public`. Algunas tablas son `tbl_*` con una **vista sin prefijo** encima (estándar OLTP Intelix, ver `sto_tms_olo/aidlc/spaces/default/memory/project.md`); el backend móvil escribe en el nombre `tbl_*` donde existe.

## Tablas que usa la app móvil

| Tabla | Qué guarda | Escribe |
|---|---|---|
| `routes` | Viaje en curso/cerrado: estado, `departed_at`, horas reales, `completed_stops`, `plan_trip_id` (índice único `uidx_routes_plan_trip`) | `start.py`, `positions.py`, `stops.py` |
| `dispatch_guides` | Una por parada: estado de entrega, orden (`sequence_number`), `stop_type`, foto y firma | `start.py`, `stops.py`, `evidence.py` |
| `tbl_tracking_positions` | Cada punto GPS (único por `client_id`) | `positions.py` |
| `tbl_tracking_last_positions` | Última posición **usable** por viaje | `positions.py` |
| `tbl_tracking_events` | Bitácora: `route_started`, `delivery_completed`, `delivery_failed`, `geofence_out`, `incident`, `pickup`, `return`, `route_completed`. Columnas `distance_m` y `client_id` (índice único parcial `ux_tracking_events_client`) | `stops.py`, `start.py` |
| `tbl_tracking_evidences` | Evidencias subidas: llave S3, bucket, tipo, tamaño, coordenadas, pedido | `evidence.py` |
| `tbl_tracking_stop_visits` | Llegada, salida y permanencia por parada (único por `guide_id`) | `positions.py` |
| `tbl_tracking_consents` | Consentimiento GPS versionado | `consent.py` |
| `tbl_tracking_client_access` | Acceso del rol Cliente a su entrega | (web) |
| `mobile_refresh_tokens` | Hash del refresh, `expires_at`, `revoked_at`, `device_id` | `auth.py` |
| `driver_presence` | Estado en línea/offline por conductor | `presence.py` |
| `tbl_returns` | Devoluciones contracamión (una fila por artículo) | `stops.py` |
| `drivers` | `app_user_id` enlaza chofer ↔ usuario | (admin) |
| `plan_trips`, `plan_trip_stops`, `orders`, `order_items`, `stores`, `delivery_zones` | Lectura para armar el viaje | `start.py`, `trips.py` |

Una guía (`dispatch_guides`) se crea **al iniciar** el viaje, una por pedido del plan, con número `<VJ-…>-<n>`.

## Migraciones propias (`backend/mobile/sql/`)

| Archivo | Qué hace |
|---|---|
| `m01_mobile_base.sql` | `drivers.app_user_id` (+ índice único parcial), `tracking_events.distance_m`, `tracking_consents`, `mobile_refresh_tokens` |
| `m02_mobile_indices.sql` | Índices de rendimiento (`routes(driver_id, organization_id)`, `dispatch_guides(route_id, sequence_number)`, expiración de refresh) |
| `m03_driver_presence.sql` | `driver_presence` y `tracking_events.client_id` |
| `m04_photo_product.sql` | Admite `photo_product` en el CHECK de evidencias |
| `m05_stop_type.sql` | `dispatch_guides.stop_type` (`delivery`\|`collection`, por defecto `delivery`) |
| `m06_stop_visits.sql` | `tbl_tracking_stop_visits` + vista |
| `m07_tracking_client_access.sql` | `tbl_tracking_client_access` + vista (rol Cliente) |
| `m08_photo_return.sql` | Admite `photo_return` en el CHECK de evidencias |

Se aplican con `backend/mobile/scripts/migrate.py` (usa credenciales admin `DB_ADMIN_*`). Las ocho (`m01`–`m08`) están aplicadas en Aurora (2026-11-05); el historial queda en `mobile_migrations`, con checksum.

## Migraciones del TMS que sustentan el módulo (`sto_tms_olo/sql/`)

`15_matriz_permisos_roles`, `40_tracking_vivo`, `41_tracking_chofer_usuario`, `42_tracking_revisiones`, `43_tracking_app_chofer`, `44_tracking_rendimiento`, `45_tracking_presencia_chofer`, `54_tracking_evidencias_pedido`.

## Reglas de datos importantes

- **Idempotencia por UUID de teléfono:** `tbl_tracking_positions.client_id`, `tbl_tracking_events.client_id`, evidencias por `client_id`, devoluciones por `DV-<client_id>`.
- **Normalización de estados al leer:** el TMS escribe «En tránsito»/«Completada»; scripts viejos usan otros vocabularios; `logic.route_state` y `logic.guide_state` unifican solo al **leer**.
- **Auditoría:** un trigger de BD toma el actor de la sesión (`audit.bind`), no de la aplicación.

## SQLite en el teléfono

`kv`, `position_queue`, `outbox` — ver [offline-y-sincronizacion.md](./offline-y-sincronizacion.md).
