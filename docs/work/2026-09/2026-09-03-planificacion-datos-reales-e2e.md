# 2026-09-03 — Planificación: resiliencia mock/real de EFLOW + e2e agnósticas a datos

Commits: `b807a96`, `220e637`, `24908dd` (fechados 2026-09-02; registrados hoy).
El único commit con fecha 2026-09-03, `dae2aea`, es solo el audit log de AI-DLC
(auto-generado) y no lleva entrada propia.

## What changed

Dos fallos de `/planificacion` que solo aparecían con el backend `server/` (:4000)
sirviendo viajes/rutas reales de EFLOW QA en vez de los fixtures mock:

1. **Reparto de Flota — pool vacío.** `fetchPedidosDeRuta` consultaba
   `orders.route_type_id` (columna uuid) con ids del catálogo EFLOW
   (`eflow-rt-08`, string) → 400 de Postgres → el error se tragaba y el pool
   quedaba en `[]` ("0 pedidos pendientes"). Solo funcionaban las 2 rutas con
   UUID real.
2. **Agrupación por día (feature COFERSA) inerte con datos reales.**
   `RouteConfigForm` cruzaba viaje↔calendario COFERSA con
   `parseInt(route_type_name)`, pero los viajes reales traen el nombre sin
   número (`"GUANACASTE BAJURA"`) → los ~90 viajes caían en "Otros días".

Y la suite e2e `planificacion-flujo` dejó de pasar porque asumía los fixtures
mock (`"Viaje 1"`, 5 pedidos exactos).

## Why

El repo evolucionó de "solo Supabase mock" a un modo dual: catálogos y viajes
reales de EFLOW QA vía `server/`, con fallback al mock. Varios consumidores
(`pedidos-api`, `RouteConfigForm`) seguían asumiendo el mundo mock —
identificadores UUID, nombres de ruta con prefijo numérico. Las pruebas e2e
quedaron atadas a fixtures que ya no son lo que se sirve cuando `pnpm server`
está arriba.

## How

- `pedidos-api.ts`: guard `UUID_RE` — si `routeTypeId` no es uuid, va directo a
  `getFallbackPedidos` (jamás casaría contra la columna uuid); `try/catch`
  alrededor de la query para uuids reales con Supabase caído. Mismo patrón de
  resiliencia que `catalogos-api.ts` / `eflow-api.ts`.
- `RouteConfigForm.tsx`: `numeroRuta()` saca el número de `route_type_id`
  (`/^eflow-rt-(\d+)/`) y cae a `route_type_name` para el catálogo mock.
- `e2e/planificacion-flujo.spec.ts`: reescrito data-agnóstico — selecciona
  viajes por posición (no por etiqueta), afirma `> 0` en vez de contar. Las
  pruebas atadas a un fixture mock concreto se auto-`skip` si no hay datos mock.
- `e2e/reparto-flota.spec.ts` (nuevo): regresión del pool vacío + gating del
  botón "Calcular Reparto".
- `e2e/matriz-rutas.spec.ts` (nuevo): leyenda visible con sus 5 estados, chip de
  cita previa (44 REY), glifo "ambos" en rutas GAM.

Verificado: `pnpm test` 70/70 · `tsc` 0 errores en `planificacion` · `pnpm build`
OK · `playwright` 12/12 (+1 skip por fixture mock ausente con `server/` arriba).

## Promoted knowledge

`docs/guides/eflow-qa-schema-planificacion.md` §"Identificadores y modo dual"
(nuevo): `route_type_id` es UUID en el catálogo mock y `eflow-rt-<código>` en
datos reales; `orders.route_type_id` (Supabase) es UUID y solo acepta los
primeros; el número de ruta para cruces (calendario COFERSA) se extrae del id
`eflow-rt-NN` o del prefijo del nombre `"NN · ..."`.

## Follow-ups

- [ ] `eflow-api.fetchViajes` dispara ~100 requests `/api/viajes/:id/pedidos` en
  cada carga (task #4), casi todos abortados. Debería ser lazy (al seleccionar
  el viaje). Pendiente de decisión — ver conversación 2026-09-02.
- [ ] Sábado GAM asumido sin actividad en el calendario COFERSA — confirmar con
  negocio (heredado de `2026-09-02-cofersa-dias.md`).
