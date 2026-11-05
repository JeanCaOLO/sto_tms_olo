# 2026-11-05 — Documentación completa de Tracking móvil

**Qué se hizo:** se documentó la app del chofer (`TRACKING_TMS/frontend`) y su backend (`backend/mobile`, `/api/mobile/v1`) en `docs/tracking/mobile/`. Solo documentación; no se tocó código.

**Archivos nuevos:** `docs/tracking/mobile/` — `README`, `arquitectura`, `api-movil-v1`, `autenticacion-y-sesion`, `gps-y-ubicacion`, `offline-y-sincronizacion`, `viaje-y-paradas`, `evidencias-y-devoluciones`, `presencia-y-notificaciones`, `modelo-de-datos`, `configuracion-y-despliegue`, `pruebas` y `pendientes/` (README + 01–06).

**Archivos editados:** `docs/tracking/README.md` y `docs/INDEX.md` (enlace a `mobile/`).

**Fuentes leídas:** `backend/mobile/src/mobile_api/{logic,routes,stops,auth,positions,start,evidence,presence,trips,security,config}.py`, `backend/mobile/sql/m01–m08`, `TRACKING_TMS/frontend/src/{gps/policy,sync/outbox,sync/presence,lib/arrival,config,db/kv}.ts`, `TRACKING_TMS/DEPLOY.md`.

**Verificado en una segunda pasada** (y docs corregidos): `gps/task.ts`, `gps/sync.ts`, `sync/connectivity.ts`, `auth/session.ts`, `lib/permissions.ts`.

**No verificado** (viene del barrido de exploración): `lib/use-permissions-gate.ts`, `api/http.ts`, columnas exactas de las tablas y el estado de las migraciones `m04`–`m08` en Aurora.

**Hallazgos:** contradicciones entre el contrato v2 / blueprints y el código (cierre automático del viaje, login propio, chofer inicia viaje, cifras de pruebas) → `docs/tracking/mobile/pendientes/01`.
