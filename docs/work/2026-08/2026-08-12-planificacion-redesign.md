# 2026-08-12 — Planificación de Rutas: rediseño visual

## What changed
Redesigned the visual language of the Planificación module (`ConfiguracionRuta`, `PedidosRuta`, `RutaEnConstruccion`, `RutasGeneradas`) without touching the data layer, hooks, or mock backend. Added a numbered vertical stop timeline to "Ruta en Construcción" and a compact mini stop-preview + derived status badge (Hoy/Programada/Completada) to each generated-route card. Split every touched component into smaller pieces to stay under the 150-line component ceiling, since the pre-redesign versions were already over it.

## Why
User feedback: the module "se ve feo" and basic compared to real route-planning TMS tools, and the "Rutas Generadas" tab needed richer per-route visual detail (stop sequence, status) instead of a bare metadata list.

## How
Researched Onfleet, Routific and general route-optimization UI patterns (drag-and-drop stop lists, numbered/sequenced stops, capacity gauges, time-window and ETA framing) via web search — confirmed the two patterns most applicable to a 12-36 routes/day, ≤50-stop operation without a live map: (1) a numbered-circle + connector-line vertical timeline for the stop list, and (2) a condensed dot-preview of the first N stops on summary cards. Implemented with existing Tailwind classes and `src/components/base/*` primitives only — no new dependency, no map/tiles.

New files under `src/pages/planificacion/components/`: `StopBadge.tsx`, `CapacityBar.tsx`, `RouteConfigForm.tsx`, `PedidoCard.tsx`, `ParadaCard.tsx`, `StopMiniPreview.tsx`, `RutaGeneradaCard.tsx`; plus `src/pages/planificacion/route-status.ts` (derives a display-only Hoy/Programada/Completada badge from `fechaRuta` — no new persisted field, no change to `generar-ruta-mock.ts`/`mock-store.ts`).

Kept the existing `flex-1 min-h-0` scroll pattern in the two list panels (dropped the old fixed `max-h-[...]` cap entirely instead of just keeping it, since flex sizing already bounds them via the page layout).

Verified: `npx tsc --noEmit --project tsconfig.app.json` (zero errors in `planificacion`; pre-existing errors elsewhere untouched), `npx eslint src/pages/planificacion --ext ts,tsx` (clean), and manual verification against the running dev server — filled the config form, confirmed empty/loading states, and injected a synthetic route into `localStorage` (`sto_mock_rutas_generadas`, removed after) to confirm the new `RutaGeneradaCard`/`StopMiniPreview`/status badge render correctly, since both fallback `route_type_id`s currently have 0 pending orders in the shared dev database (per `MOCKING.md`'s known-exhaustion caveat).

## Promoted knowledge
None — `MOCKING.md` unchanged, since `route-status.ts` is a pure display derivation, not a new mock data source or persisted field.

## Follow-ups
- [ ] `src/pages/planificacion/components/PedidosDisponibles.tsx` (182 lines, over the 150-line ceiling) is dead code — not imported anywhere, superseded by `PedidosRuta.tsx`. Left untouched as out of scope; worth deleting in a follow-up.
- [ ] Both fallback `route_type_id`s in `fallback-rutas.ts` show 0 pending orders right now — team needs a fresh `route_type_id` with real pending orders (or test data) to exercise the full "Nueva Ruta" flow end-to-end again.
- [ ] No new dependency was added for the stop-sequence visual (plain divs/Tailwind); if a real map view is wanted later, that's a separate, larger piece of work (`src/lib/routePlanning/` already has Google Maps driving-distance groundwork).
