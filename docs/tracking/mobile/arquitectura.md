# Tracking móvil — arquitectura

## Vista general

```
 Teléfono (Expo / React Native)                         AWS (sandbox us-east-2)
 ┌───────────────────────────────┐                   ┌─────────────────────────────────────┐
 │ Pantallas (expo-router)       │   HTTPS /api/     │ API Gateway HTTP API                │
 │ GPS task `tms-gps` ──┐        │   mobile/v1       │  └─ ANY /api/mobile/v1/{proxy+}     │
 │ position_queue (SQLite)       ├──────────────────►│      Lambda dev-tms-mobile-mobile-api│
 │ outbox (SQLite) ──────┘       │                   │      (Python 3.13, arm64, en la VPC)│
 │ SecureStore (tokens)          │                   │        ├─ Aurora PostgreSQL          │
 └──────────────┬────────────────┘                   │        ├─ Secrets Manager (BD, JWT)  │
                │ POST multipart (URL prefirmada)    │        └─ S3 bucket de evidencias     │
                └───────────────────────────────────►│                                       │
                                                     └─────────────────────────────────────┘
                                          Monitor web (`/tracking`) lee las mismas tablas
```

La Lambda cuelga de **una sola ruta** `ANY /api/mobile/v1/{proxy+}`; `routes.resolve` reconstruye la ruta real y sus `{id}` (`backend/mobile/src/mobile_api/routes.py:42`).

## App (`TRACKING_TMS/frontend`)

| Capa | Dónde | Qué hace |
|---|---|---|
| Pantallas | `src/app/` | `login`, `index` (agenda y viaje), `consentimiento`, `gps`, `parada/[id]`, `firma`; `_layout.tsx` hace la guarda de sesión y permisos. |
| API | `src/api/` | `http.ts` (cliente con refresh), `tracking.ts` (tipos y llamadas), `my-trips.ts`, `stop-items.ts`. |
| Sesión | `src/auth/session.ts` | Zustand + SecureStore. |
| GPS | `src/gps/` | `policy.ts` (reglas puras), `task.ts` (tarea de fondo), `sync.ts` (envío por lotes), `state.ts`, `here.ts`, `use-gps.ts`. |
| Sync | `src/sync/` | `outbox.ts`, `evidence.ts`, `presence.ts`, `connectivity.ts`, `use-agenda.ts`, `use-outbox.ts`. |
| BD local | `src/db/` | `kv.ts` (esquema SQLite), `positions.ts`, `outbox.ts`, `reset.ts`. |
| Utilidades | `src/lib/` | `arrival.ts`, `battery.ts`, `capture.ts`, `geo.ts`, `permissions.ts`, `return-form.ts`, `today.ts`, `trip-label.ts`, `feedback.ts`. |
| i18n | `src/i18n/` | `es.ts` y `en.ts`. |

**Stack:** Expo SDK 58, React Native 0.88, React 19.3, TypeScript, expo-router, Zustand, TanStack Query, i18next, `expo-location` + `expo-task-manager` (GPS en segundo plano), `expo-sqlite` (colas), `expo-secure-store` (tokens), `expo-image-picker` (foto), `react-native-signature-canvas` (firma), `expo-network`, `expo-battery`, `expo-crypto`. Pruebas: Jest (`jest-expo`).

Reglas para tocar la app: ver `TRACKING_TMS/frontend/AGENTS.md` (Expo cambia por SDK; consultar docs de la versión antes de usar APIs).

## Backend (`sto_tms_olo/backend/mobile`)

| Módulo (`src/mobile_api/`) | Responsabilidad |
|---|---|
| `routes.py` | Tabla `PUBLIC`/`PRIVATE`, `resolve`, `dispatch`, `handler` (una línea de log por petición, sin cuerpo ni token). |
| `auth.py`, `security.py` | Login, refresh con rotación, logout, `Driver`, caché de contexto 60 s, JWT. |
| `trips.py`, `start.py` | `GET mi-viaje`, iniciar viaje. |
| `stops.py` | Transición, novedades, artículos y devoluciones. |
| `positions.py`, `presence.py`, `consent.py` | Lotes GPS y visitas, heartbeat, consentimiento. |
| `evidence.py` | URL prefirmada de S3 y confirmación. |
| `logic.py` | Reglas **puras** (sin BD ni AWS): geocerca, estados, ETA, validaciones, llaves S3. |
| `sql.py`, `db.py` | Consultas y transacciones. |
| `config.py`, `http.py`, `errors.py`, `audit.py` | Soporte. |

Principios: lógica de negocio en `logic.py` (testeable sin mocks); handlers delgados; todo escritor de estado usa **una transacción**; todo reenvío es **idempotente** por `client_id`; la auditoría usa `audit.bind` para que el trigger de BD registre el actor.

## Decisiones de diseño relevantes

- **Backend propio, JWT propio.** Un token de la app no sirve en el TMS ni al revés (secreto distinto). Credenciales: las mismas de `auth_credentials`/`app_users`.
- **Lotes, no punto a punto.** ~24 llamadas/hora por chofer en vez de ~120 ([gps-y-ubicacion.md](./gps-y-ubicacion.md)).
- **El servidor decide el tipo de parada y qué evidencias exige**, no el cliente (`logic.REQUIRED_EVIDENCE`).
- **La app no deshace entregas.** `to=pending` devuelve 403 `revert_not_allowed`; solo la web revierte.
- **Mismas constantes de ETA que la web** (línea recta ×1,35 a 30 km/h + 5 min por parada) para que chofer y administrador vean el mismo retraso (`logic.py:1-5`).

## Despliegue (resumen)

SAM por stack, sandbox cuenta 758837481569 / us-east-2. Detalle en [configuracion-y-despliegue.md](./configuracion-y-despliegue.md).
