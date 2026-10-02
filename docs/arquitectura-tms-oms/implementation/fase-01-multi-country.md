# Fase 1 — Multi-country Foundation (registro de ejecución)

> Ver `migration-notes.md` para el incidente de cómo se aplicó la migración
> de base de datos — léelo antes de asumir que esta fase se ejecutó de
> principio a fin exactamente como se planeó.

## FILES CREATED

**SQL / migraciones**
- `sql/06_fase1_multicountry_foundation.sql`
- `scripts/seed-costa-rica.mjs` (**escrito, NO ejecutado**)

**Backend**
- `server/domain/context/resolveOperationalContext.mjs`
- `server/domain/context/authorizeOperationalContext.mjs`
- `server/tms-context-routes.mjs`

**Frontend**
- `src/hooks/useOperationalContext.tsx`
- `src/components/feature/ContextSelector.tsx`

**Tests**
- `src/__tests__/multi-tenant-isolation.test.ts`

**Documentación**
- `docs/arquitectura-tms-oms/implementation/{fase-00-baseline,fase-01-multi-country,migration-notes,testing-report}.md`

## FILES MODIFIED

- `server/tms-relations.mjs` — whitelist + FK map con las tablas de Fase 1; `license_types` → `driver_license_types`.
- `server/index.mjs` — monta `tmsContextRouter`.
- `src/lib/supabase.ts` — `apiFetch` exportado (reuso por `useOperationalContext`).
- `src/App.tsx` — envuelve el layout autenticado en `OperationalContextProvider`.
- `src/components/feature/Header.tsx` — agrega `<ContextSelector />`.
- `src/pages/conductores/components/DriverModal.tsx` — referencia a `driver_license_types` (era `license_types`, roto por el rename real).
- `src/pages/conductores/page.tsx` — encabezado de columna "Licencia" → "Licencia de conducir" (§32).
- `src/pages/tiendas/components/StoreModal.tsx` — **quitado** el selector roto de `zones` (tabla inexistente; además intentaba guardar una columna `zone_id` que tampoco existe en `stores` — el bug era más grave de lo documentado originalmente: **toda edición de Tienda fallaba**, no solo el dropdown).
- `src/pages/rutas/components/RouteTypeModal.tsx` — mismo arreglo para Tipos de Ruta (`route_types` tampoco tiene `zone_id`; **toda edición de Tipo de Ruta fallaba**).
- `src/__tests__/db-connectivity.test.ts` — tablas de Fase 1 agregadas a la whitelist esperada; referencias a `license_types` actualizadas; el test de "`zones` rompe el flujo" se reescribió como "`zones` sigue sin existir, y el frontend ya no la referencia".

## DB CHANGES

Ver `docs/arquitectura-tms-oms/08-db-gap-analysis.md` §1 para la matriz
completa. Resumen de lo efectivamente aplicado:

- `countries` +`timezone`/`locale`/`unit_system`/`date_format` (backfill respetando valores ya existentes).
- `warehouses` (nueva) — 2 filas (OLO Costa Rica, OLO Venezuela).
- `customers.warehouse_id`, `stores.warehouse_id`/`is_origin` (nuevas columnas, backfilleadas).
- `addresses`, `final_customers`, `delivery_points`, `contacts` (nuevas, vacías).
- `license_types` → `driver_license_types` (RENOMBRE) + `country_id`/`vehicle_restrictions`/`validity_rules`.
- `driver_licenses` (nueva, vacía — N:M condicional, no migrada todavía).
- `user_scopes` (nueva) — 2 filas GLOBAL (una por usuario real).
- `schema_migrations` (nueva, creada por el runner — **0 filas**, ver `migration-notes.md` sobre por qué el registro quedó pendiente).

## API CHANGES

Nuevos endpoints (`server/tms-context-routes.mjs`, todos bajo `/api`,
requieren JWT):

- `GET /v1/countries`
- `GET /v1/countries/:id/warehouses`
- `GET /v1/warehouses/:id/customers`
- `GET /v1/customers/:id/final-customers`
- `GET /v1/final-customers/:id/delivery-points`
- `GET /v1/me/context`

Todos filtran por el scope operativo real del usuario (`user_scopes`), no
solo por `organization_id` — primera vez que la API aplica ese filtro en
cualquier endpoint del sistema.

## UI CHANGES

- Selector de contexto (País → Almacén → Cliente) en el header, visible en
  desktop (`md:` y superior).
- Arreglo de dos bugs de guardado preexistentes en Tiendas y Tipos de Ruta
  (ver arriba).
- Encabezado "Licencia" → "Licencia de conducir" en Conductores.

## TESTS

- `src/__tests__/multi-tenant-isolation.test.ts` — 7 tests, **todos en
  verde** (el esquema ya existe, ver incidente). Cubre: Caso 1 (aislamiento
  cliente↔cliente), Caso 4 (`final_customer` no se ve desde el `customer_id`
  equivocado), Caso 5 (`delivery_point` pertenece al `final_customer`
  correcto; máximo un `is_default`), y la regla de `UNIQUE(customer_id, external_code)` del §8.
- `src/__tests__/db-connectivity.test.ts` — 60 tests, sigue en verde con las
  tablas nuevas agregadas.
- Suite completa: 151/151 verde (1 falla preexistente confirmada como
  flaky, no relacionada).

**Pendiente (no bloquea el cierre de Fase 1, pero es trabajo real de
testing):** casos 2 y 3 del prompt de implementación (pedidos de un cliente
no visibles para otro; CR↔VE) requieren datos reales de `orders`/`routes`
con `warehouse_id` poblado — hoy esas tablas están vacías (ver limpieza de
datos de ejemplo de una sesión anterior) y el seed de Costa Rica no se ha
ejecutado. Se agregan en cuanto haya datos para probarlos.

## RISKS

- Ver `migration-notes.md` — riesgo de proceso ya materializado y
  documentado, no repetido gracias a la corrección al runner.
- `scripts/seed-costa-rica.mjs` no se ha ejecutado — la Fase 1 tiene el
  modelo pero no el volumen de datos que pide el §21 del prompt de
  implementación todavía.

## TODO

1. Ejecutar `scripts/seed-costa-rica.mjs --execute` (con aprobación
   explícita, dado el incidente de esta fase).
2. Registrar `06_fase1_multicountry_foundation.sql` en `schema_migrations`
   retroactivamente.
3. Extender `multi-tenant-isolation.test.ts` con los Casos 2/3 una vez haya
   datos de `orders`/`routes` para probarlos.
4. Decidir sobre `driver_licenses` (N:M) — ver `03-modelo-datos-erd.md` §9.2.
5. La decisión de negocio sobre semántica de "zona" sigue abierta (no
   bloquea Fase 1 — el bug de flujo ya está corregido sin necesitar esa
   decisión, ver `08-db-gap-analysis.md` §5).
