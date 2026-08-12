# 2026-08-12 — Fix anchor-state bug, replace native alerts with toasts, add fleet-level route splitting

## What changed
Fixed a bug where pinned ("anclado") orders stayed pinned after switching to a different route (anchors weren't cleared on route change or after generating a route). Built a reusable in-app toast system (`src/hooks/useToast.tsx` + `src/components/base/ToastStack.tsx`) and replaced every native `alert()` in the Planificación module with it, since blocking browser dialogs freeze the whole tab and don't fit the redesigned UI. Added capacity validation to the anchor ("pin") action itself: pinning an order that would push the already-anchored total over the vehicle's safety-margin capacity is now blocked with a toast, instead of silently allowing it and only complaining after "Optimizar". Implemented backlog item #1 from `docs/decisions/0001-...md` (multi-vehicle fleet splitting) as a new "Reparto de Flota" tab.

## Why
User-reported bug (anchors leaking across routes) plus three explicit requests: remove all browser-native modals, validate capacity at the point of pinning rather than after the fact, and implement the #1 backlog item from the research doc — multi-vehicle order-pool splitting, since planning one vehicle at a time was identified as the single biggest gap versus real TMS products.

## How
`page.tsx` had grown close to its 200-line ceiling, so the "Nueva Ruta" tab's JSX was extracted into `components/NuevaRutaTab.tsx` first to make room. The anchor bug was fixed by wiring `limpiarAnclas()` into both the route-change handler and the post-generation reset callback. The fleet split feature follows the same architectural pattern as the rest of the module: a pure algorithm module (`fleet-split.ts` — sorts vehicles by capacity descending, fills each via the existing `seleccionarPorCapacidad` from `capacity-fit.ts`, moves to the next with the remainder), a data-loading hook (`use-flota-split.ts`, reuses `fetchPedidosDeRuta`), a generation hook (`use-generar-flota.ts`, loops `generarRutaMock` per assignment), and three small components (`FlotaSlotPicker`, `FlotaResultadoPreview`, `FlotaSplitTab`). Verified live in the browser: an 8-order/2480.5kg pool split across a Ford Transit and Hyundai H350 correctly produced two routes (975kg/1180kg, both under their 85% weight margin) with 2 orders correctly flagged as unassignable, then both routes generated and appeared in "Rutas Generadas".

## Promoted knowledge
`docs/decisions/0001-route-planning-safety-margin-and-optimization.md` updated: backlog item 1 marked implemented, with a note on the known simplification (driver/transportista assignment per vehicle is optional in the fleet-split UI, not enforced).

## Follow-ups
- [ ] Fleet-split routes currently generate with `transportistaId: ''` always — no UI to pick a transportista per vehicle slot, only an optional conductor. Worth adding if this becomes more than a prototype.
- [ ] Backlog items 2-7 (time windows, driver hours, geo-clustering, real driving distance, vehicle-type matching, cost trade-off) remain open, prioritized in the ADR.
- [ ] The fleet-split greedy fill is sequential/largest-vehicle-first, not a true multi-bin optimum — flagged with a `ponytail:` comment in `fleet-split.ts` for future upgrade if uneven fill becomes a real problem.
