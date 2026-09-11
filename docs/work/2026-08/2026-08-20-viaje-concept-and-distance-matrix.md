# 2026-08-20 — Fix capacity-fill bug, add "viaje" grouping, N×N distance matrix

## What changed
Fixed a bug: pinning ("anclar") one order and manually removing all others, then hitting "Optimizar paradas", left only the anchored order instead of filling up to the vehicle's safety-margin capacity — `optimizarRuta` was pulling candidates from the shrinking `pedidosSeleccionados` list instead of the full route pool (`pedidosRuta`), so once the pool was emptied there was nothing left to fill from.

Implemented two items from the Reunión 2026-08-18 (Planificación de Rutas con Ricardo, ver Notion): (1) the "viaje" concept — the module's "Nueva Ruta" flow now starts by selecting a dispatched **viaje** (WMS trip grouping n pedidos + n destinos with the route already assigned), not a bare route + manual pedido selection; (2) a precalculated N×N distance matrix replacing the old ad-hoc per-pair euclidean distance in the nearest-neighbor optimizer.

## Why
The capacity-fill bug was user-reported and directly contradicted `capacity-fit.ts`'s own documented intent ("the rest of the capacity is filled largest-first from the remaining orders").

The meeting surfaced that the module was missing a real concept from the business's WMS/Iflow: orders don't get planned individually, they arrive already grouped into a "viaje" with its route pre-assigned upstream — and the TMS must trust that assignment, not recompute it (the concrete case: a client asking for delivery on a different route is handled by reassigning to another viaje, not by touching the order's route directly). The N×N matrix was the agreed replacement for the current warehouse→client-only distance file, precalculated once instead of computed live.

## How
**Bug fix:** `use-pedidos-ruta.ts`'s `optimizarRuta` now sources candidates from `pedidosRuta` (the full viaje pool) instead of `pedidosSeleccionados`. Verified live in browser: anchoring 1 order (320kg) then removing the other 7, then optimizing, now fills to 3 stops / 1220kg (81% of 1500kg capacity) instead of staying at 1.

**Viaje concept:** new `Viaje` type (`types.ts`) wrapping `route_type_id`/`route_type_name`/`pedidos[]`. `fallback-viajes.ts` groups the existing 8 mock stops (from `fallback-pedidos.ts`, now exported as `MOCK_STOPS`) into 3 synthetic viajes by geographic affinity, reusing the real `FALLBACK_RUTAS` IDs so route assignment looks WMS-sourced. `viajes-api.ts` + `use-viajes.ts` follow the existing mock-API/hook pattern (no real `trips` table exists yet — this isn't RLS-blocked, the migration simply hasn't been designed into Supabase, only into the data model doc below). `use-pedidos-ruta.ts` was reworked to take a `Viaje` object directly (`setViaje`) instead of fetching by `route_type_id`; `page.tsx`, `NuevaRutaTab.tsx`, `ConfiguracionRuta.tsx`, `RouteConfigForm.tsx` were updated to select a viaje (route becomes read-only, derived from it). "Reparto de Flota" (fleet split) was deliberately left on the old route-based pool — out of scope for this pass, it's a separate multi-vehicle concern.

One mock viaje order carries `is_exception: true` with no coordinates, modeling the meeting's other open point (delivery address different from the client's registered one, arriving as free-text in Iflow with no lat/lng). `PedidoCard.tsx` now shows an "Excepción" badge for it.

**Distance matrix:** `distance-matrix.ts` builds an N×N table (Map keyed by ordered pair) from `haversineKm` (reused from `src/lib/routePlanning/haversine.ts`, not reimplemented) with a 1.35 detour factor — computed once per "Optimizar paradas" click since viajes here are small (≤50 stops per the ADR). `optimize-stops.ts` consumes it via lookup, falling back to raw euclidean degrees only for pairs missing from the matrix (i.e. the exception order). Orders without coordinates are now explicitly excluded from the nearest-neighbor pass and appended at the end of the result, instead of crashing on `undefined` lat/lng — this is also a genuine (small) bug fix exposed by adding the first no-coordinate order to the mock data. `page.tsx` shows a toast on optimize when any order in the pool lacks coordinates.

Data model for the real Supabase migration (`locations`, `trips`, `trip_orders`, `location_distances`) was designed by `crew:data-architect` but **not applied** — no real DB write path exists yet for this branch (see MOCKING.md), so only the TS types + mock layer were implemented. Full schema, indexing rationale, and open questions are in that subagent's response, not yet promoted to a standalone ADR file.

Verified live in browser: viaje selector shows "Viaje 1/2/3 — Ruta X"; selecting Viaje 2 loads its 3 pedidos including the exception one (badge visible); optimizing produces a toast warning and orders the two geocoded stops first, exception stop last.

## Promoted knowledge
`MOCKING.md` updated with two new rows (viajes, distance matrix) and their removal conditions.

## Follow-ups
- [ ] Real `trips`/`trip_orders`/`locations`/`location_distances` Supabase migration not written — needs its own ADR/migration file when the WMS integration question (sync vs. batch, see data-architect's two open questions) gets answered.
- [ ] "Reparto de Flota" (fleet split) still plans from a route-based pool, not from viajes — inconsistent with "Nueva Ruta" now. Revisit once the viaje model is validated.
- [ ] Distance matrix is haversine + fixed detour factor, not Google Maps — intentional for mock data (no real addresses worth spending API quota on); `src/lib/routePlanning/build-matrices.ts` already has the real Google Maps + fallback path, unfused.
- [ ] No UI yet for resolving an exception order's actual delivery point (meeting's tentative idea: capture it from the driver's Tracking app instead of solving in Planificación) — currently it's just visibly excluded with a badge and a toast.
