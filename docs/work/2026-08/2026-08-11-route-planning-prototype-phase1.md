# 2026-08-11 — Route planning prototype (Fase 1: driving distance + time windows + capacity)

## What changed
Added `src/lib/routePlanning/` — a standalone, dependency-free planning engine that takes a list of stops (coordinates, weight, volume, optional delivery window) and a vehicle capacity, and returns a nearest-neighbor delivery order with warnings for time-window violations and capacity overflow. Distance/duration come from Google Maps Distance Matrix API (driving mode, batched in 10x10 blocks) when an API key is supplied, or a haversine + flat-speed fallback when it isn't. Added an assert-based self-check runnable with `node --experimental-strip-types src/lib/routePlanning/plan-route.selfcheck.ts` (no test framework in the project yet). Also added a root `.gitignore` (none existed) after `npm install` revealed `node_modules` was untracked but not ignored.

## Why
Jean Carlo approved starting this module's prototype without waiting on the database (2026-08-10 meeting) and answered the open research questions on 2026-08-11: Google Maps preferred, max 50 stops/route, 8am–7pm delivery windows apply from phase 1 (not phase 2 as originally assumed), and the planner should alert (not silently drop) orders that exceed vehicle capacity so they can be reassigned to another trip.

## How
Pure functions, no UI wiring yet (matches the requested scope: "solo en set de coordenadas y calcular el orden óptimo"). One symbol per file per the crew code-quality standard: `types.ts`, `haversine.ts` (fallback distance/duration), `google-distance-matrix.ts` (driving-mode client with batching), `build-matrices.ts` (chooses Google vs. fallback), `plan-route.ts` (greedy nearest-neighbor with window/capacity tracking, split into `pickNearestUnvisited` + `advance` to stay under the 30-line function ceiling). Verified with `tsc --noEmit` and `eslint` — zero errors/warnings in the new files (the rest of the app has pre-existing, unrelated type errors).

## Promoted knowledge
None yet — this is still a prototype per Jean Carlo's explicit "no sobre-construir" scope. Once it's wired into `planificacion/page.tsx` and connected to real catalogs (vehicle capacity table, IPRAC coordinates), promote the algorithm's contract to a living guide.

## Follow-ups
- [ ] Get Venezuela client coordinates from IPRAC (pending Toño confirmation to Jean Carlo).
- [ ] Get the real vehicle capacity catalog from Jean Carlo (currently no hardcoded values in the planner — capacity is a required caller-supplied parameter).
- [ ] Wire `planRoute`/`buildMatrices` into the existing `planificacion/page.tsx` UI, replacing the current straight-line `optimizarParadas`.
- [ ] Define the Tracking hand-off table with Justin (Jean Carlo's suggestion: Planificación writes to a table, Tracking reads from it — no direct call).
- [ ] Decide where the Google Maps API key lives (`VITE_GOOGLE_MAPS_API_KEY` env var, OLO-owned account) before this leaves prototype stage — never commit it.
