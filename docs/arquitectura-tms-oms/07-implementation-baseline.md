# Documento 7 — Implementation Baseline

> Revalidado el 2026-09-21 directamente contra el código y contra Aurora (no
> contra el análisis anterior). **Ningún cambio de aplicación ocurrió entre
> `02-to-be.md` y este documento** (verificado: `git status` solo mostraba la
> carpeta `docs/arquitectura-tms-oms/` como nueva). El AS-IS sigue siendo
> válido; este documento agrega el nivel de detalle de inventario técnico que
> pide la Fase 0.

## 1. Stack y versiones

| Capa | Tecnología | Versión |
|---|---|---|
| Frontend | React + Vite + `@vitejs/plugin-react-swc` | Vite 7.3.6 |
| Routing | `react-router-dom` (lazy routes) | — |
| Estilos | Tailwind (design system en `src/components/base|feature`) | — |
| Backend | Express | 4.21.2 |
| DB driver (Aurora) | `pg` | ^8.23.0 |
| DB driver (EFLOW QA) | `mssql` (tedious) | 11.0.1 |
| Auth | JWT (`jsonwebtoken`) + `bcryptjs` | — |
| Excel export | `xlsx` (SheetJS) | ^0.18.5 |
| Precisión numérica (Tarifas) | `decimal.js` | — |
| Tests unitarios | `vitest` | 4.1.11 |
| Tests e2e | `playwright` | — |
| Node | — | v24.20.0 (entorno de desarrollo) |

## 2. Autenticación y autorización actuales

- **Autenticación**: JWT propio (`server/tms-auth.mjs`) — `POST /api/auth/login`
  verifica `auth_credentials` (bcrypt) y firma un JWT de 7 días;
  `requireAuth` middleware exige `Authorization: Bearer <token>`.
- **Autorización**: `app_users.role_id` → `roles` (5 roles reales, ver
  `03-modelo-datos-erd.md`). **No existe ningún concepto de scope** —
  ningún usuario está limitado a un país/almacén/cliente; el único filtro es
  `organization_id`, y ni siquiera se aplica de forma centralizada (cada
  página filtra manualmente por `appUser.organization_id`).
- **Frontend**: `useAuth()` (`src/hooks/useAuth.tsx`) expone `session`,
  `appUser`; hay un modo `MOCK_AUTH_ENABLED` (`src/lib/mock-auth.ts`) para
  desarrollo sin login real.

## 3. Configuración y variables de entorno

| Archivo | Uso | Estado |
|---|---|---|
| `.env` | `VITE_*` (legado Supabase, ya no usado realmente) + credenciales AWS reales | **Tracked en git — riesgo de seguridad ya reportado, fuera de alcance de esta fase** |
| `.env.local` | `TMS_DB_*` (Aurora), `JWT_SECRET` | Correcto — gitignored |
| `vite.config.ts` | Proxy `/api` → backend Express; alias `@` → `src/` | OK |

## 4. Tests existentes

| Suite | Alcance | Resultado al momento de este documento |
|---|---|---|
| `vitest` (14 archivos, 144 tests) | Lógica pura de Planificación (`src/pages/planificacion/**`) y Tarifas (`src/lib/tarifas/__tests__/`) | ✅ Pasan |
| `src/__tests__/db-connectivity.test.ts` (60 tests) | Conectividad Aurora + existencia de cada tabla usada por el frontend | ✅ Pasan (con el túnel SSM activo) |
| `e2e/*.spec.ts` (Playwright) | Flujos de Planificación | No ejecutados en esta sesión |

**No existe ningún test de aislamiento multi-tenant** (§20 del prompt de
implementación) — es trabajo nuevo de esta fase.

## 5. Estructura de carpetas relevante

```
src/
  pages/**               24 rutas — ver ../reference/analisis-sistema-tms.md §2
  components/base/       design system (Card, Button, Badge, DataTable, ...)
  components/feature/    Sidebar, Header, StatCard, CsvImportModal
  hooks/                 useAuth, useSidebar, useToast
  lib/
    supabase.ts          shim propio (fetch), NO Supabase real
    mock-auth.ts
    tarifas/             kernel de reglas/costeo — PURO, sin React/fetch
      localData/         datos del kernel en localStorage (NO Postgres)
      __tests__/
  __tests__/             tests de conectividad de infraestructura (nuevo, esta sesión)
server/
  index.mjs              Express app; monta tmsRouter + rutas EFLOW
  db.mjs, queries.mjs    EFLOW QA (mssql) — legado, capa "eflow read-only API"
  tms-*.mjs              motor de queries genérico sobre Aurora (pg)
sql/
  01_*.sql .. 05_*.sql   migraciones NUMERADAS pero SIN runner ni tabla de historial
docs/
  arquitectura-tms-oms/  este paquete de documentos
```

## 6. Migraciones existentes — estado real

**No existe ningún framework de migraciones.** `sql/01_*.sql` … `sql/05_*.sql`
son archivos numerados que se ejecutan **manualmente** (confirmado: el
encabezado de `sql/01_fase1_zonas_reglas.sql` dice explícitamente "este
proyecto no tiene migraciones ni un archivo de tipos generado"). No hay
tabla `schema_migrations` ni `migrations` en Aurora (verificado con
`to_regclass`, ambas devuelven `NULL`).

**Acción para Fase 0/1 (ver §7 del prompt de implementación):** se crea un
runner mínimo (`scripts/run-migration.mjs`) + tabla `schema_migrations`,
reutilizando la convención de nombres `sql/NN_descripcion.sql` ya establecida
— no se introduce un ORM ni un framework pesado.

## 7. Seeds y mocks existentes

- `src/pages/seed/page.tsx` — herramienta manual de siembra de datos demo
  (usada por el prototipo original; los datos que sembró ya fueron
  eliminados de Aurora en esta sesión — ver historial de la conversación).
- `src/pages/oms/mockData.ts` — datos 100% en memoria del módulo OMS.
- `src/lib/tarifas/localData/store.ts` — datos del kernel de tarifas en
  `localStorage` del navegador (países, zonas, reglas de tarifa, FX, costos,
  política de margen).

## 8. Endpoints existentes

| Prefijo | Fuente | Autenticación |
|---|---|---|
| `/api/data/:table` (GET/POST/PATCH/DELETE) | Aurora, vía `tms-routes.mjs` | JWT (`requireAuth`) |
| `/api/auth/*` (login, signup, session, signout) | Aurora (`auth_credentials`) | — (login es público) |
| `/api/health`, `/api/viajes*`, `/api/catalogos/*` | EFLOW QA (mssql) | Ninguna (son de solo lectura, consumidas solo por `/planificacion`) |

## 9. Integración EFLOW — estado real (re-confirmado)

Sin cambios desde `01-as-is.md`: código de solo lectura existe
(`server/db.mjs`), sin credenciales en este entorno, solo alimenta
`/planificacion`. Re-verificado: `GET /api/health` con el backend activo en
este entorno sigue devolviendo `502 { detail: "Sin credenciales para país \"cr\"" }`.

## 10. Identificadores — estrategia real (§28 del prompt de implementación)

**UUID en todas las tablas de negocio**, generado por defecto en Postgres.
Única excepción: `depreciacion` usa `codigo_camion` (natural key) como PK —
heredado de la migración de costeo (`sql/04_costeo_base_costa_rica.sql`), no
un error a corregir en esta fase. Toda tabla nueva de Fase 1 sigue el
estándar UUID.

## 11. Confirmación de vigencia del AS-IS

| Afirmación de `01-as-is.md` | Re-verificada | Resultado |
|---|---|---|
| Tabla `zones` no existe | Sí (`to_regclass` → `NULL`) | **Sin cambio** |
| OMS 100% mock | Sí (código sin tocar) | **Sin cambio** |
| EFLOW sin credenciales en este entorno | Sí (`/api/health` re-probado) | **Sin cambio** |
| Motor de tarifas (`src/lib/tarifas/`) no conectado a Aurora | Sí — confirmado además con `repository.ts`: usa `localData/store.ts` (localStorage), y **documenta explícitamente** que `stores`/`route_types` reales no tienen `zone_id` | **Sin cambio, con detalle nuevo relevante para §23 (ver `08-db-gap-analysis.md`)** |

**No se encontraron discrepancias entre la documentación anterior y el
código actual.** El único hallazgo nuevo (no un cambio, sino una
profundización) es la evidencia explícita en `repository.ts` sobre la
semántica de "zona" — ver `08-db-gap-analysis.md` §4.
