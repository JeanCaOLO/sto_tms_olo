# Tracking móvil — app del chofer

**Qué es:** la app del chofer (Android/iOS, Expo) y su backend `/api/mobile/v1`. Es la que **produce** lo que el monitor web de Tracking muestra: posiciones GPS, presencia, llegada/salida de paradas, entregas, novedades, devoluciones y evidencias (foto de factura/producto y firma). El monitor web (`/tracking`) solo lee; ver [`../README.md`](../README.md).

El chofer **inicia su propio viaje** (plan confirmado de hoy), recorre las paradas, y el viaje **se cierra solo** al registrar la última parada (entregada o no entregada). Funciona con o sin señal: todo se guarda en el teléfono y sale en orden cuando hay red.

## Estado (2026-11-05)

| Pieza | Estado |
|---|---|
| App (`TRACKING_TMS/frontend`) | Hecha. APK vía GitHub Actions o EAS; iOS por TestFlight. |
| Backend `backend/mobile` | Hecho y **desplegado en el sandbox** (stack `dev-tms-mobile`, us-east-2). Producción la lleva Intelix. |
| Migraciones `m01`–`m03` | Aplicadas en Aurora (según `TRACKING_TMS/DEPLOY.md`). |
| Migraciones `m04`–`m08` | **Por verificar** que estén aplicadas — ver [pendientes/03](./pendientes/03-aplicar-migraciones-mobile.md). |
| Push remoto | **No existe.** Solo aviso en pantalla y notificación del servicio GPS. |
| Prueba en teléfono real contra Aurora | Pendiente — ver [pendientes](./pendientes/README.md). |

## Mapa de código (tres lugares)

| Qué | Dónde |
|---|---|
| App del chofer (repo aparte, con su propio `.git`) | `TRACKING_TMS/frontend/` — `src/app` (pantallas), `src/api`, `src/auth`, `src/gps`, `src/sync`, `src/db`, `src/lib` |
| Backend móvil (Python 3.13, Lambda/SAM) | `sto_tms_olo/backend/mobile/` — `src/mobile_api/*`, `sql/m01…m08`, `tests/`, `template.yaml` |
| Monitor web de Tracking | `sto_tms_olo/src/pages/tracking/` + `sto_tms_olo/backend/tracking/` (documentado en [`../`](../README.md)) |
| Guías de despliegue de la app | `TRACKING_TMS/DEPLOY.md`, `TRACKING_TMS/PENDIENTES_BACKEND.md` |

## Documentos

| Archivo | Para qué |
|---|---|
| [arquitectura.md](./arquitectura.md) | Stack, componentes, capas de la app y despliegue. |
| [api-movil-v1.md](./api-movil-v1.md) | Contrato `/api/mobile/v1`: endpoints, payloads, errores, idempotencia. **Fuente única** para app y backend móvil. |
| [autenticacion-y-sesion.md](./autenticacion-y-sesion.md) | Login, JWT, refresh con rotación, límites de intentos, sesión en el teléfono. |
| [gps-y-ubicacion.md](./gps-y-ubicacion.md) | Tarea en segundo plano, filtros, muestreo, lotes, reglas del servidor, consentimiento. |
| [offline-y-sincronizacion.md](./offline-y-sincronizacion.md) | Colas SQLite (`position_queue`, `outbox`), dependencias, reintentos, reconexión. |
| [viaje-y-paradas.md](./viaje-y-paradas.md) | `mi-viaje`, iniciar viaje, transiciones, geocerca, cierre automático, novedades. |
| [evidencias-y-devoluciones.md](./evidencias-y-devoluciones.md) | Fotos, firma, subida a S3, devolución contracamión. |
| [presencia-y-notificaciones.md](./presencia-y-notificaciones.md) | Heartbeat, estado en línea, permisos y avisos (sin push remoto). |
| [modelo-de-datos.md](./modelo-de-datos.md) | Tablas, migraciones y relaciones. |
| [configuracion-y-despliegue.md](./configuracion-y-despliegue.md) | Variables, secretos, bucket, builds, cómo correr en local. |
| [pruebas.md](./pruebas.md) | Suites existentes, cómo correrlas, qué no cubren y plan en teléfono. |
| [pendientes/](./pendientes/README.md) | Lo que falta, inconsistencias entre docs y ajustes posibles. |

## Relación con otros docs

- [`../contrato-api-v2.md`](../contrato-api-v2.md) es el contrato **web** (`/api/v1/tracking`). Esta carpeta documenta el contrato **móvil**; no se repite lo del web.
- Los blueprints `sto_tms_olo/.test/blueprint/mobile-tracking-tms/` (carpeta `.test/`, no se sube al repo) describen el diseño original; `01-contrato-api.md` y `02-flujo-del-chofer.md` **están desactualizados**. Vale esta carpeta.
