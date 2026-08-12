# 2026-08-12 — Fix layout responsive bug, mock route generator, MOCKING.md

## What changed
Fixed a real layout bug: `Sidebar`'s collapsed state was local, while `App.tsx` (`ml-64`) and `Header.tsx` (`left-64`) hardcoded the expanded width independently, so content never resized when the sidebar collapsed and there was no mobile drawer behavior. Added `useSidebar.tsx` (shared context) and made Sidebar a proper off-canvas drawer below the `lg` breakpoint. Fixed a whitespace bug in `PedidosRuta`/`RutaEnConstruccion` (fixed `max-h-[...]` left dead space with few items — switched to `flex-1 min-h-0` so the list fills the actual available height). Added a mock route-generation layer (`generar-ruta-mock.ts`, `mock-store.ts`, localStorage-backed) plus a "Rutas Generadas" tab/view in the Planificación page, since real writes are still blocked by RLS. Documented all of this in a new `MOCKING.md`.

## Why
User-reported UX bugs: ugly browser scrollbar and non-resizing content when collapsing the sidebar, no responsive/mobile behavior, and empty space at the bottom of the pedidos card. Also asked for a way to generate and see multiple routes without a real DB connection, and for explicit documentation of what's mocked so it's easy to rip out later.

## How
Root-caused the layout bug by inspecting computed styles/classNames directly in a live browser session — confirmed the `collapsed` state was never propagated outside `Sidebar.tsx`. Lifted it to a `SidebarProvider` context consumed by `Sidebar`, `Header`, and `App`'s `main` margin, all driven by the same source of truth, with `lg:` breakpoints for desktop vs. an off-canvas mobile drawer. Reused the existing crew-installed code-quality hook to keep every new/touched file under its ceiling (page 200, hook 80, module 200) — this triggered a real split of `planificacion/page.tsx` in a prior session and continued the same pattern here for the new files.

## Promoted knowledge
`MOCKING.md` (repo root) is now the living doc for what's mocked and how to remove it — supersedes any prior verbal/chat explanation.

## Follow-ups
- [ ] The two fallback `route_type_id`s in `fallback-rutas.ts` depend on live shared Supabase data (pending orders) that teammates can consume — confirmed during this session when Jean Carlo (or someone) generated real routes against the same dev DB mid-testing, exhausting both fallback IDs' pending orders. May need new IDs periodically.
- [ ] Deeper visual/UX redesign of the Planificación module (research-informed, "exponential" improvement per user request) is still pending — out of scope for this entry, tracked separately.
- [ ] Could not visually confirm the layout fix via screenshot (preview pane wasn't compositing frames in this session); verified structurally via DOM className/state inspection instead. Worth a manual visual check next session.
