# 2026-08-25 — Merge delivery time windows (ETA per stop, outside-window warning)

## What changed
Fused the time-window logic from the prototype (`src/lib/routePlanning/plan-route.ts`) into the active Planificación UI. When the user clicks "Optimizar paradas", each stop in the resulting sequence now has an estimated time of arrival (ETA) calculated from real OSRM travel durations. Stops whose ETA falls outside the 8:00–19:00 delivery window are visually flagged (red border, "Fuera de ventana" badge) and a warning toast appears. This implements backlog item #2 from `docs/decisions/0001-route-planning-safety-margin-and-optimization.md`.

## Why
The optimizer could previously produce stop sequences that arrive after 7 pm without any visual cue — the planner would generate a route and only realize the issue at dispatch time. This was the #2 priority in the research-backed backlog (right after multi-vehicle splitting, already done).

## How
- `distance-matrix.ts`: extended the OSRM `/table` call to request both `distance` and `duration` annotations. The `MatrizDistancias` interface now exposes a `duracionMin(idA, idB)` method alongside `distanciaKm`. The haversine fallback estimates duration at 30 km/h average urban speed.
- `time-windows.ts` (new, 67 lines): holds `DEFAULT_WINDOW_START_MIN` (480 = 8 am), `DEFAULT_WINDOW_END_MIN` (1140 = 7 pm), a 5-min service-time constant, `calcularEtas()` (walks the clock forward through ordered stops using the matrix durations), and `formatEta()` (minutes→HH:MM).
- `capacity-fit.ts`: `optimizarConCapacidad` now calls `calcularEtas()` on the ordered result, enriching each `PedidoSeleccionado` with `eta_min` and `outside_window`.
- `types.ts`: `PedidoSeleccionado` gained optional `eta_min` and `outside_window` fields.
- `use-pedidos-ruta.ts`: `optimizarRuta` now returns `{ fuente, fueraDeVentana }` so the caller can trigger the warning toast.
- `page.tsx`: `handleOptimizarRuta` shows a warning toast when `fueraDeVentana > 0`.
- `ParadaCard.tsx`: displays ETA (teal text with clock icon) next to the order number, red "Fuera de ventana" badge + red border/background when `outside_window` is true.

Ponytail simplifications (marked in code):
- Service time is a flat 5 min per stop, not per-order. Ceiling: multi-package or difficult-access stops take longer. Upgrade: make `service_time` a per-order field from the WMS.
- Haversine duration fallback assumes 30 km/h. Ceiling: ignores traffic and road type. Upgrade: always prefer OSRM.

## Promoted knowledge
`docs/decisions/0001-route-planning-safety-margin-and-optimization.md` updated: backlog item 2 marked as implemented.

## Follow-ups
- [ ] Per-customer time windows (the code defaults to 8–19 if none specified; the data model is ready for `windowStartMin`/`windowEndMin` per order when the WMS provides it).
- [ ] Driver shift-hour limits (backlog item 3) — similar clock logic, different constraint source.
- [ ] Visual indicator in the FlotaSplitTab (fleet split results don't show ETAs yet — only the single-vehicle flow does).
