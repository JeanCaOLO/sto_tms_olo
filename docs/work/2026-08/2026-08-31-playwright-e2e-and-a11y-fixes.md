# 2026-08-31 — Playwright e2e suite for Planificación + accessibility/exception-address fixes

## What changed
Wrote and ran an end-to-end Playwright suite against the live Planificación de Rutas flow (viaje selection → optimize → generate → Rutas Generadas), which surfaced two real defects that were fixed in the same session: `Select`/`Input` (`src/components/base/`) never associated their `<label>` with the control (no `htmlFor`/`id`), and `exception_address_raw` — the real delivery instructions captured for an "excepción" order since the 2026-08-18 viaje-mock work — was set on the data but never rendered anywhere in the UI. The suite was then promoted from a scratch script into a committed suite (`@playwright/test` devDependency, `playwright.config.ts`, `e2e/`).

## Why
The user asked for Playwright testing of the frontend. Building a real interaction test (not just a page-load smoke check) required simulating a full user session, which is exactly the kind of exercise that catches wiring gaps a manual click-through skips — labels that "look" connected visually but aren't programmatically, and a data field a component author added to the type but forgot to render.

## How
- `src/components/base/Select.tsx`, `Input.tsx`: added `useId()` to generate a stable id (or respect an explicit `id` prop), wired to the new `<label htmlFor>`.
- `src/pages/planificacion/components/PedidoCard.tsx`, `ParadaCard.tsx`: render `exception_address_raw` inline (amber callout) when `is_exception` is set, in both the pedidos panel and the ruta-en-construcción panel.
- `playwright.config.ts`: `testDir: e2e/`, `webServer` auto-starts `npm run dev` on `localhost:3000` if not already running.
- `e2e/planificacion-smoke.spec.ts`: home + `/planificacion` load without console errors; regression check that every form field now resolves via `getByLabel`.
- `e2e/planificacion-flujo.spec.ts`: full route generation flow against real Supabase catalogs (read-only; route generation itself writes to `localStorage` under mock auth, never touching the DB) — viaje selection auto-includes its pedidos (business rule: "TMS no reasigna ruta↔pedido", Reunión 2026-08-18), capacity-based exclusion on optimize, toast + Rutas Generadas tab on generate; the exception-order case (regression for the address fix); and viaje switching not leaking previously-selected paradas.
- `tsconfig.node.json`: added `e2e/` and `playwright.config.ts` to `include` so they're type-checked.

Ponytail note: the two fixes were found by testing, not sought out — no broader audit of other base components or other unrendered fields was done. Both are narrow, verified fixes, not a sweep.

## Promoted knowledge
None — no living guide existed to update for either the base UI components or the exception-order case; this entry is the record.

## Follow-ups
- [ ] No other component consuming `Pedido`/`PedidoSeleccionado` was audited for similarly-unrendered fields — worth a quick grep pass if more WMS "exception" fields get added later.
- [ ] `e2e/` currently covers only Planificación; no CI wiring yet (`test:e2e` is a local script) — add to CI once the team decides on a pipeline step for it.
