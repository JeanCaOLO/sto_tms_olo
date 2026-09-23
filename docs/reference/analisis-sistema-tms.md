# Análisis del sistema TMS/OMS — estado actual, mapa de módulos y alcance de integración

> Generado por análisis directo del código en `C:\GitHub\TMS` (no de la documentación de
> negocio). Fecha: 2026-09-21. Complementa, no reemplaza, [`contexto-proyecto-tms.md`](contexto-proyecto-tms.md),
> [`plan-modulo-oms.md`](plan-modulo-oms.md) y las decisiones en `aidlc/spaces/default/memory/project.md`.

## 1. Resumen ejecutivo

- El **TMS** (catálogos, rutas, liquidaciones, tracking, etc.) es una SPA React que habla
  con un backend propio (Express + PostgreSQL) sobre **AWS Aurora** (`tms_olo`). Esta capa
  **funciona** — conectividad verificada en esta sesión (ver §5).
- El **OMS** (Panel, Cola de Priorización, Motor de Reglas, Simulador, Auditoría,
  Calendario de Rutas) está **construido sobre datos mock en memoria**
  (`src/pages/oms/mockData.ts`). No toca la base de datos de AWS, no toca WMS, no toca
  ERP. Es una maqueta funcional a la espera de Construcción real.
- La conexión a **EFLOW (WMS)** existe en el código, pero solo para **QA** y solo para
  alimentar `/planificacion` (lectura de viajes/rutas/conductores/vehículos). **No está
  configurada en este entorno** (sin credenciales) y **no existe ninguna conexión al WMS
  de producción** (`EFLOW_OLO` CR) — está pendiente de solicitar, según ya está registrado
  en `project.md`.
- El ERP **EPRAC** no tiene ninguna integración de código. Se menciona únicamente como
  dependencia de negocio en la documentación (`project.md`, actas de reunión): la OMS lee
  una fecha que EPRAC genera, pero no hay ningún cliente HTTP/DB hacia EPRAC en el repo.
- Hay al menos **dos roturas de flujo reproducibles** hoy mismo, documentadas en §5 con
  causa raíz exacta.

## 2. Árbol de módulos (frontend, por ruta)

Fuente: `src/router/config.tsx`. Cada hoja es una página real y navegable.

```
/ , /dashboard                     Dashboard (KPIs agregados)
/login                             Login
/pedidos                           Pedidos (WMS → TMS, catálogo de órdenes)
/rutas                             Catálogo de Rutas + Tipos de Ruta
/planificacion                     Planificación automática (pedidos con entrega mañana → viajes por destino)
/vehiculos                         Vehículos + Tipos de Vehículo
/conductores                       Conductores (+ catálogo de licencias)
/clientes                          Clientes (catálogo)
/tiendas                           Tiendas / puntos de entrega
/paises                            Países
/transportistas                    Transportistas (carriers)
/reglas-tarifa                     Tarifario — zonas, FX, plantillas, costos, bitácora
/liquidaciones                     Liquidaciones de viaje (settlements)
/configuracion                     Organización · Usuarios · Roles · Preferencias
/devoluciones                      Devoluciones
/guias                             Guías de despacho
/tracking                          Tracking de rutas en vivo (mapa + timeline)
/contratos                         Contratos y documentos (transportistas, etc.)
/reportes                          Reportes / analítica
/seed                              Herramienta de siembra de datos DEMO (ver §6)
/oms  → /oms/panel                 Panel OMS (salud del motor, alertas)      [MOCK]
/oms/cola                          Cola de Priorización                     [MOCK]
/oms/reglas                        Motor de Reglas (catálogo semi-config.)   [MOCK]
/oms/simulador                     Simulador de Reglas                      [MOCK]
/oms/rutas-despacho                Calendario de Rutas y Días de Despacho   [MOCK]
/oms/auditoria                     Auditoría de Priorización                [MOCK]
```

## 3. Arquitectura: quién habla con quién

```
┌─────────────────────────────┐
│  React SPA (Vite)            │
│  src/pages/**  ─┐             │
│                 │  fetch vía   │
│                 │  src/lib/    │
│                 │  supabase.ts │ (shim compatible con supabase-js;
│                 │              │  NO hay Supabase real en el sistema)
└─────────────────┼─────────────┘
                   │  /api/data/:table   (JWT, server/tms-auth.mjs)
                   ▼
┌───────────────────────────────────────────┐
│  server/index.mjs  (Express, puerto 4000)   │
│                                              │
│  ├─ tmsRouter (server/tms-routes.mjs)        │──► pg.Pool ──► AWS Aurora PostgreSQL
│  │   motor de queries genérico:               │      (tms_olo, vía túnel SSM local)
│  │   tms-select / tms-mutations / tms-schema  │      ESTADO: conectado y funcional
│  │   whitelist de tablas: tms-relations.mjs   │
│  │                                            │
│  └─ rutas EFLOW QA (server/db.mjs +           │──► mssql (tedious) ──► SQL Server EFLOW
│      queries.mjs): /api/health, /api/viajes,  │      (EFLOW_WMH + EFLOW_OLO/EFLOW_FEBECA,
│      /api/catalogos/*  — SOLO lectura,         │      por país CR|VE)
│      consumidas SOLO por /planificacion        │      ESTADO: sin credenciales en este
│                                                │      entorno → 502 "Sin credenciales"
└───────────────────────────────────────────┘

┌───────────────────────────────────────────┐
│  src/pages/oms/**                            │
│  useXController → omsApi (mock)              │──► src/pages/oms/mockData.ts
│  Panel · Cola · Reglas · Simulador ·          │      (arrays en memoria, con delay()
│  Auditoría · Calendario de Rutas              │      simulando latencia de red)
│                                                │      ESTADO: NO toca Aurora, NO toca
│                                                │      WMS, NO toca ERP. 100% maqueta.
└───────────────────────────────────────────┘

ERP EPRAC: sin ningún código de integración en el repo (ver §4).
```

Puntos clave:

- `src/lib/supabase.ts` es un **shim propio** (no la librería de Supabase): implementa la
  misma interfaz encadenable (`.from().select().eq()...`) pero contra el backend Express
  de arriba. Se conserva el nombre por compatibilidad de imports, no hay Supabase real.
- El **motor de queries genérico** (`tms-select.mjs`/`tms-mutations.mjs`) valida cada
  tabla contra una whitelist estática (`tms-relations.mjs`). Una tabla que el frontend
  referencia pero no está en esa lista falla con error de tabla desconocida — ver
  el caso `zones` en §5.

## 4. Alcance de integración con WMS (EFLOW) y ERP (EPRAC)

### 4.1 WMS — EFLOW

| Aspecto | Estado real en el código |
|---|---|
| Conexión de solo lectura a EFLOW QA (`server/db.mjs`, `mssql`) | **Existe**, por país (CR: `EFLOW_WMH`+`EFLOW_OLO`; VE: `WMH`+`EFLOW_FEBECA`) |
| Endpoints expuestos | `GET /api/health`, `/api/viajes`, `/api/viajes/:id`, `/api/viajes/:id/pedidos`, `/api/catalogos/{rutas,transportistas,conductores,vehiculos}` — todos de solo lectura, un único `SELECT` parametrizado cada uno |
| Quién los consume | Únicamente `/planificacion` (según `server/README.md`; el resto de módulos no llama a `/api/viajes*`) |
| Credenciales en este entorno | **No configuradas** (`.env.local` no define `EFLOW_QA_*` ni `EFLOW_CR_*`/`EFLOW_VE_*`) → toda llamada falla con `502 { error: "eflow_query_failed", detail: "Sin credenciales para país ..." }` |
| Réplica de `EFLOW_OLO` (producción, CR) para que el **OMS** la consuma | **No existe.** Ya registrado como pendiente en `project.md` ("la RÉPLICA de EFLOW_OLO (CR) AÚN NO EXISTE — hay que solicitarla") |
| El OMS lee pedidos de EFLOW hoy | **No.** El OMS lee de `src/pages/oms/mockData.ts` (ver §4.3) |

En otras palabras: **hay un puente real a EFLOW, pero es de QA, de solo lectura, y solo
alimenta Planificación** — no es la fuente de datos del OMS ni está conectado en este
entorno ahora mismo.

### 4.2 ERP — EPRAC

Búsqueda exhaustiva en el código de aplicación (`src/`, `server/`, `scripts/`): **cero
referencias a EPRAC.** No hay cliente HTTP, driver de base de datos, variable de entorno,
ni mención en comentarios de código. Las únicas menciones a EPRAC están en documentos de
negocio (`project.md`, actas de reunión en `aidlc/.../knowledge/documents/`), donde se
registra que:

- El OMS **lee** la `fecha de expedición planificada` como insumo (no la escribe).
- La `fecha de generación` de EPRAC "cambia sola al generar" (efecto observado, no
  integrado por código).

**Conclusión: la integración con EPRAC está 0% construida.** Es un dato de negocio
documentado, no una conexión de sistema.

### 4.3 Módulo OMS — mecánica de datos actual

`src/pages/oms/api/omsApi.ts` (comentario original del archivo, íntegro):

> "Capa de API MOCK del OMS. Simula llamadas asíncronas sin backend real (sin Supabase,
> sin Lambdas). En Construcción real esto se reemplaza por la capa de datos contra el
> lago/Supabase."

Cada pantalla del OMS (`cola`, `panel`, `reglas`, `simulador`, `auditoria`,
`rutas-despacho`) pasa por un `use<Modulo>Controller` que llama a `omsApi`, que a su vez
lee de `mockData.ts` con un `delay()` artificial. **Ningún hook de React Query ni fetch
real está involucrado.** Es deliberado (comentario de diseño explícito, alineado con
`project.md`: la arquitectura objetivo real es AWS serverless + Python/Lambdas + esta
misma capa de datos, aún no construida).

## 5. Verificación de conectividad y roturas de flujo encontradas

Metodología: conexión directa a Aurora vía el túnel SSM activo (`localhost:5432`), y
pruebas HTTP contra el backend Express (`localhost:4000`), ambos en ejecución en esta
sesión. Detalle reproducible en `src/__tests__/db-connectivity.test.ts` (nuevo, ver §7).

### 5.1 Conectividad Aurora — **OK**

`SELECT 1` y `information_schema.tables` responden correctamente; las 30 tablas del
esquema `public` son legibles. No hay rotura de conectividad DB en sí.

### 5.2 Rotura #1 — EFLOW sin credenciales en este entorno

```
GET /api/health  →  502 { "error": "eflow_query_failed", "detail": "Sin credenciales para país \"cr\"" }
```//
**Causa raíz:** `.env.local` no define `EFLOW_QA_HOST`/`EFLOW_CR_HOST` (ni sus `_USER`/
`_PASSWORD`). `server/db.mjs::paisConfig()` devuelve `null` y `getPool()` lanza. Afecta a
`/planificacion` en la parte que consume datos reales de EFLOW QA (la parte que consume
Aurora vía `supabase.ts` sigue funcionando). **No es un bug de código — es simplemente que
faltan credenciales en este entorno.** Para resolverlo: pedir a Intelix/EFLOW las
credenciales QA y cargarlas en `.env.local` como `EFLOW_QA_HOST/PORT/USER/PASSWORD` (o
`EFLOW_CR_*`).

### 5.3 Rotura #2 — tabla `zones` referenciada pero inexistente

`StoreModal.tsx` (`/tiendas`) y `RouteTypeModal.tsx` (`/rutas`, pestaña Tipos de Ruta)
hacen `supabase.from('zones')...` para poblar un selector de zona. La tabla `zones`:

- **No existe** en el esquema de `tms_olo` (`to_regclass('public.zones')` → `NULL`).
- **No está** en la whitelist de tablas del backend (`server/tms-relations.mjs`).

**Efecto reproducible:** abrir el modal de Nueva Tienda o Nuevo Tipo de Ruta dispara una
petición a `/api/data/zones` que el backend rechaza inmediatamente (tabla no reconocida);
el selector de zona queda vacío o el formulario muestra error, según cómo cada componente
maneje el `error` de la promesa. **Causa raíz:** la tabla `zones` nunca se creó — es
deuda de una migración pendiente (posiblemente relacionada con el modelo de zonas de
`reglas-tarifa`, que sí tiene su propio concepto de zona en otra tabla). Antes de tocar
este flujo, confirmar si "zona" en Tiendas/Tipos de Ruta debe ser una tabla propia nueva
o debe apuntar a una tabla de zonas ya existente en `reglas-tarifa`.

### 5.4 Sin más roturas de conectividad detectadas

El resto de los `.from('<tabla>')` usados por el frontend (ver inventario completo en
`src/__tests__/db-connectivity.test.ts`) corresponden 1:1 a tablas reales del esquema y
están en la whitelist del backend — no se encontraron más tablas fantasma.

## 6. Datos de ejemplo detectados (para limpieza — ver conversación)

Inventario completo por tabla (conteos y muestra de filas) en el mensaje de la
conversación donde se solicitó este análisis. Resumen: la mayoría de las tablas de
negocio (`customers`, `carriers`, `drivers`, `vehicles`, `stores`, `countries`, `routes`,
`orders`, `settlements`, `rates`) mezclan **datos reales/mandatados** (p. ej. clientes
Cofersa/EPA, catálogos `license_types`/`tariff_types`, costeo base Costa Rica) con **datos
de fixture del prototipo original (Readdy/Supabase)** de contexto chileno genérico
(nombres, RUTs, comunas chilenas) y con **artefactos de prueba manual** (p. ej. una
liquidación `LIQ-TEST-VERIFY` y otra `LIQ-0NaN`). La página `/seed` es la herramienta que
originalmente generó parte de estos datos demo. La limpieza se ejecuta por separado, tabla
por tabla, tras confirmar el alcance exacto (no se debe borrar `organizations`, los 2
`app_users` reales, ni los clientes/catálogos mandatados).

## 7. Pruebas de conectividad agregadas

`src/__tests__/db-connectivity.test.ts` (vitest, requiere túnel SSM activo a Aurora):

- Conexión Aurora (`SELECT 1`).
- Existencia y legibilidad de cada tabla real usada por el frontend (inventario extraído
  de todos los `.from('...')` en `src/pages/**`).
- Confirma que `zones` NO existe (test que documenta la rotura #2 en vez de ocultarla).
- Prueba del endpoint `/api/health` de EFLOW (marca `skip` con mensaje explicativo si no
  hay credenciales en el entorno, en vez de fallar en rojo sin contexto).

Correr con `npm test` (requiere el túnel SSM + backend levantados; ver
`server/README.md` y `docs/guides/tunel-ssm-a-rds.md`).
