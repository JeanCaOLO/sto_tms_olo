# TMS OLO — Transportation Management System

Aplicación web multi-módulo para gestionar la operación de transporte de OLO (última milla) en **Costa Rica y Venezuela** (más un tercer país en definición). Código de proyecto interno Intelix: **OC26007**.

Es una suite de módulos (catálogos, planificación de rutas, liquidación/tarifas, tracking, OMS, devoluciones, guías de despacho, reportería, etc.), no un único desarrollo. El MVP prioritario es **Liquidación** y **Tracking**.

> **Documentación completa:** el índice vive en [`docs/INDEX.md`](docs/INDEX.md). Este README cubre solo cómo levantar, correr y desplegar el proyecto, y la arquitectura de alto nivel. Se mantiene actualizado a medida que el proyecto avanza.

---

## Stack

| Capa | Tecnología |
|------|-----------|
| Frontend | React 19 · TypeScript 5.8 · Vite 7 · Tailwind CSS 3 · React Router 7 |
| Estado / datos | Hooks propios + `src/lib/supabase.ts` (**shim** con interfaz tipo supabase-js, habla con el backend Express — no es Supabase real) |
| Dinero / cálculo | `decimal.js` (nunca `number` de JS para montos) |
| Mapas | Leaflet + React-Leaflet |
| i18n | i18next + react-i18next |
| Backend (API TMS) | **Python 3.13 + AWS Lambda + API Gateway HTTP + SAM**, en [`backend/`](backend/README.md) (estándar Intelix). El Express de `server/` queda solo para desarrollo local hasta validar el deploy |
| Base de datos | **AWS Aurora PostgreSQL** (`tms_olo`), vía túnel SSM en local |
| Fuente WMS | SQL Server **EFLOW** (QA, solo lectura) — alimenta `/planificacion` |
| Deploy frontend | AWS Amplify (hosting SPA) |
| Backend serverless (EFLOW) | Además existen Lambdas EFLOW en el repo `olo/tms/TMS-Backend` (se solapan con `backend/eflow`; pendiente definir la fuente única) |

> **Nota de arquitectura:** el nombre `supabase.ts` es histórico. Hoy es un shim que traduce la interfaz encadenable (`.from().select().eq()...`) a llamadas HTTP contra el Express de `server/`, que a su vez consulta Aurora. **No hay una instancia de Supabase real en el sistema.** Detalle completo y verificado en [`docs/reference/analisis-sistema-tms.md`](docs/reference/analisis-sistema-tms.md).

---

## Requisitos previos

- **Node.js 20+** (el server usa `node --env-file`, nativo desde Node 20).
- **npm** o **pnpm**. El repo tiene `pnpm-lock.yaml` (pnpm es el gestor de CI/Amplify), pero `npm` también funciona para desarrollo local.
- Para datos reales: acceso a la BD Aurora (túnel SSM) y/o credenciales de EFLOW QA. Sin eso, se trabaja en **modo mock** (ver abajo).

---

## Cómo levantarlo

```bash
# 1. Instalar dependencias
npm install            # o: pnpm install

# 2. Configurar entorno local (gitignored)
cp .env.example .env.local
# editar .env.local con las credenciales que apliquen (ver sección Entorno)

# 3. Levantar el frontend (Vite)
npm run dev            # o: pnpm dev
```

- El frontend arranca en **http://localhost:3000** (si el puerto está ocupado, Vite usa el siguiente libre, p. ej. 3001).
- Vite proxya `/api/*` → `http://localhost:4000` (el backend Express local).

### Backend API local (opcional, para datos reales de EFLOW en Planificación)

```bash
npm run server         # o: pnpm server  → http://localhost:4000
```

Requiere credenciales `EFLOW_*` en `.env.local`. Sin ellas, las llamadas a EFLOW responden `502` y `/planificacion` cae a sus datos mock. Detalle del server: [`server/README.md`](server/README.md).

> **Recomendado: `npm run api:local`** en lugar de `npm run server`. Corre las Lambdas Python de `backend/` en el mismo puerto `:4000`, incluida la administración de usuarios y roles (Configuración), que el Express no tiene. Requiere `pip install -r backend/requirements-dev.txt` y el túnel a Aurora (`scripts/tunel-aurora.ps1`). El login es siempre con usuarios reales. Detalle: [`backend/README.md`](backend/README.md#desarrollo-local).

### Modo mock (sin base de datos ni login real)

Si no tenés login funcional ni acceso a la BD, activá el bypass de autenticación en `.env.local`:

```
VITE_MOCK_AUTH=true
```

Entra como superusuario mock sin pasar por el login. Qué más queda mockeado y cómo quitarlo: [`docs/guides/mocking-planificacion.md`](docs/guides/mocking-planificacion.md).

---

## Scripts

| Script | Qué hace |
|--------|----------|
| `npm run dev` | Frontend en desarrollo (Vite, puerto 3000) |
| `npm run server` | Backend Express local (legado, puerto 4000) |
| `npm run api:local` | Lambdas Python de `backend/` en local (puerto 4000) — recomendado |
| `npm run build` | Build de producción a `out/` |
| `npm run preview` | Sirve el build local |
| `npm run lint` | ESLint (máx. 0 warnings) |
| `npm run type-check` | `tsc --noEmit` sobre el proyecto de la app |
| `npm test` | Tests unitarios (Vitest) |
| `npm run test:coverage` | Tests con cobertura |
| `npm run test:e2e` | Tests end-to-end (Playwright) |

---

## Entorno (`.env.local`)

Nunca commitear credenciales. `.env` y `.env.local` están en `.gitignore`. Plantilla: [`.env.example`](.env.example).

| Variable | Para qué |
|----------|----------|
| `VITE_MOCK_AUTH` | `true` para saltar el login (modo mock) |
| `VITE_API_BASE` | Base del API desplegado. Vacío en dev (usa el proxy de Vite) |
| `EFLOW_CR_*` / `EFLOW_VE_*` / `EFLOW_QA_*` | Credenciales SQL Server de EFLOW (WMS), por país |
| `EFLOW_API_PORT` | Puerto del server Express (default 4000) |
| `GITLAB_TOKEN` | Token para los scripts de mirror de repos |

---

## Despliegue

### Frontend → AWS Amplify

Build de Vite (`out/`) servido en Amplify como SPA.

- **CI (Amplify git):** definido en [`amplify.yml`](amplify.yml) — `pnpm install --frozen-lockfile` + `pnpm build`, artefacto `out/`.
- **Deploy manual por zip:** [`deploy-frontend.ps1`](deploy-frontend.ps1) buildea con `VITE_API_BASE`/`VITE_MOCK_AUTH`, empaqueta `out/` (con rutas forward-slash — clave para que Amplify no dé 404 en los assets) y hace `create-deployment` → upload → `start-deployment`.

```powershell
./deploy-frontend.ps1                       # dev, login real (usuarios de Aurora) — default
./deploy-frontend.ps1 -Mock                 # solo demo sin BD (mock auth)
./deploy-frontend.ps1 -ApiBase "https://<id>.execute-api.us-east-1.amazonaws.com/qa"
```

### Backend

El backend oficial está en [`backend/`](backend/README.md): Lambdas Python 3.13 con AWS SAM, un stack por módulo (`auth`, `data`, `context`, `eflow`) colgado de un API Gateway compartido (`common-services`) y los secretos en Secrets Manager. **Solo Intelix despliega.** Los pasos, los secretos y el mapa Express→Lambda están en `backend/README.md`; la decisión, en [`docs/decisions/0002-backend-lambdas-python-sam.md`](docs/decisions/0002-backend-lambdas-python-sam.md). El output `ApiUrl` de `common-services` es el `-ApiBase` de `deploy-frontend.ps1`.

Tests del backend: `cd backend && pip install -r requirements-dev.txt && pytest`.

El `server/` (Express) queda solo para desarrollo local hasta que el deploy de `backend/` se valide en dev.

> **Estándar obligatorio:** toda infraestructura va por IaC (SAM). Nada de cambios manuales en la consola de AWS. Ver [`docs/standards/desarrollo-aws-intelix.md`](docs/standards/desarrollo-aws-intelix.md).

---

## Arquitectura (alto nivel)

```
┌──────────────────────────┐
│  React SPA (Vite)         │  src/pages/**  →  src/lib/supabase.ts (shim)
└───────────┬──────────────┘
            │  /api/data/:table   (JWT)
            ▼
┌──────────────────────────┐        ┌─────────────────────────────┐
│  server/ (Express :4000)  │──pg──▶ │  AWS Aurora PostgreSQL       │
│  motor de queries genérico │        │  (tms_olo, vía túnel SSM)    │
│                            │──mssql▶│  SQL Server EFLOW QA (RO)    │
└──────────────────────────┘        └─────────────────────────────┘
```

- Frontend: páginas por módulo en `src/pages/<modulo>/`, ruteadas en `src/router/config.tsx`. Patrón `Page → useController → Api`.
- Componentes base reutilizables en `src/components/base/` (design system: `Card`, `Button`, `Badge`, `Input`, `Select`...). No mezclar kits de UI.
- Todo listado de registros usa `DataTable` (`src/components/base/DataTable.tsx`). Filtro por columna: sin filtro no hay nada marcado; marcar un valor muestra solo las filas con ese valor (p. ej. Cliente = EPA en Puntos de Entrega).
- `tsconfig.app.json` no puede tener opciones deprecadas: TypeScript 6 las rechaza y TypeScript 7 las elimina. `alwaysStrict` va en `true` aunque `strict` siga en `false`.
- El módulo **OMS** (`src/pages/oms/`) hoy corre 100% sobre datos mock en memoria (`mockData.ts`) — es una maqueta a la espera de construcción real.
- Mapa de módulos por ruta, integraciones WMS/ERP y roturas conocidas: [`docs/reference/analisis-sistema-tms.md`](docs/reference/analisis-sistema-tms.md).

---

## Estructura del repositorio

```
src/            Frontend React (pages, components, hooks, lib)
backend/        Backend oficial: Lambdas Python + SAM (un stack por módulo) — ver backend/README.md
server/         Backend Express local (legado; se retira al validar backend/)
sql/            Scripts SQL (esquema de tarifas, costeo base CR) — no se corren solos
scripts/        Utilidades (build de datos, mirror de repos)
infra/          Infraestructura (p. ej. OSRM en Docker)
e2e/            Tests end-to-end (Playwright)
docs/           Documentación del proyecto — empezar por docs/INDEX.md
standards/      code-quality.md (reglas de calidad crew, ruta esperada por los hooks)
```

---

## Trabajo con agentes de IA (Kiro + Claude Code)

En este repo trabajan en paralelo **Kiro** y **Claude Code** sobre el mismo checkout. Se coordinan por el archivo compartido [`.agents/CANAL.md`](.agents/CANAL.md): antes de modificar archivos, cada agente lo lee y corre `git status`, y nunca revierte cambios sin commitear que no son suyos.

**La primera vez que tomes el proyecto** (Windows), instalá Orca para que Kiro pueda delegarle tareas a Claude Code:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/setup-orca.ps1
```

Qué hace el script, cómo verificarlo y cómo funciona el canal: [`docs/guides/coordinacion-claude-kiro.md`](docs/guides/coordinacion-claude-kiro.md).

---

## Estándares de desarrollo (obligatorios al escribir código)

- **Calidad de código** ([`standards/code-quality.md`](standards/code-quality.md)): una responsabilidad por archivo; techos de líneas duros (página 200, componente 150, hook 80, servicio 150, módulo 200); funciones ≤30 líneas; naming en inglés; sin magic numbers. Cruzar un techo = dividir el archivo, nunca desactivar la regla.
- **Técnico / AWS** ([`docs/standards/desarrollo-aws-intelix.md`](docs/standards/desarrollo-aws-intelix.md)): IaC con SAM, metodología AI/DLC con validación humana por etapa, seguridad.
- **Arquitectura de datos** ([`docs/standards/arquitectura-datos.md`](docs/standards/arquitectura-datos.md)): SSOT, arquitectura medallón.

---

## Documentación

| Necesito… | Ir a |
|-----------|------|
| Índice general | [`docs/INDEX.md`](docs/INDEX.md) |
| Estado real del sistema (arquitectura, módulos, integraciones) | [`docs/reference/analisis-sistema-tms.md`](docs/reference/analisis-sistema-tms.md) |
| Referencia de negocio y técnica | [`docs/reference/`](docs/reference/README.md) |
| Estándares de desarrollo | [`docs/standards/`](docs/standards/README.md) |
| Cómo funciona algo hoy (guías vivas) | [`docs/guides/`](docs/guides/) |
| Decisiones de arquitectura (ADR) | [`docs/decisions/`](docs/decisions/README.md) |
| Historial de cambios significativos | [`docs/work/`](docs/work/README.md) |
| Backend Lambda (estructura, despliegue, secretos) | [`backend/README.md`](backend/README.md) |
| Coordinación Kiro ↔ Claude Code / Orca | [`docs/guides/coordinacion-claude-kiro.md`](docs/guides/coordinacion-claude-kiro.md) |

> **Mantenimiento:** este README y la documentación se actualizan **en el mismo cambio que el código** que los afecta (regla de `docs/MAINTAINING.md`). Si cambiás cómo se levanta, se corre o se despliega el proyecto, actualizá este archivo en el mismo PR.
