# 0001 — Set vehicle-capacity safety margin and prioritize next optimization features

- **Status**: Accepted — safety margin split implemented 2026-08-12 (`src/pages/planificacion/capacity-fit.ts`); **backlog item 1 (multi-vehicle fleet split) implemented 2026-08-12** (`src/pages/planificacion/fleet-split.ts` + "Reparto de Flota" tab); **backlog item 2 (delivery time windows / ETA per stop) implemented 2026-08-25** (`src/pages/planificacion/time-windows.ts` + `distance-matrix.ts` duration support + `ParadaCard.tsx` visual warning); items 3-7 still open
- **Date**: 2026-08-12
- **Owner role**: researcher (findings for product-strategist / frontend-architect to action)
- **Affects**: `src/pages/planificacion/capacity-fit.ts`, `src/lib/routePlanning/*`, future Planificación de Rutas UI

## Context

`capacity-fit.ts` fills a vehicle to 93% of its rated weight and volume capacity before routing stops. The 93% figure was picked ad hoc, with no grounding in regulation, industry practice, or comparable products. This module is also a single-vehicle, straight-line-distance prototype: it has no time windows, no driver-hours limits, and no way to split one order pool across several vehicles at once — all real needs for a 12–36 route/day, up to 50-stop, mixed-fleet (moto→truck) operation in Costa Rica and Venezuela. Before building further on top of the 93% assumption, the safety-margin question and the shape of "what to build next" needed real-world grounding.

## Decision

Replace the single flat 93% margin with **two separate margins — weight and volume — set independently, not derived from one number**, and adopt a prioritized backlog for the module driven by what production route-optimization products actually implement.

### Safety margin: what the evidence supports

Weight and volume are not the same kind of constraint and should not share one safety factor:

- **Weight is a legal/safety constraint.** Exceeding GVWR or axle ratings affects braking, stability, and is subject to citation (Costa Rica: Decreto N.º 31363-MOPT, *Reglamento de Circulación por Carretera con Base en el Peso y las Dimensiones de los Vehículos de Carga*, sets hard maximums by vehicle class — it does not define an operational buffer, that's a carrier decision). Fleet-management guidance converges on **80–85% of rated payload/GVWR** as the practical ceiling, to absorb uneven load distribution, driver/dispatcher estimation error, and dynamic weight transfer under braking/cornering (Work Truck Online; Campway; Apple Truck & Trailer, recommending 15–20% buffer specifically for trailers). Nothing in the research supports 93% for weight — it's above the range every source gives.
- **Volume ("cube") is an operational constraint, not a safety one.** Running out of physical space has no regulatory dimension and no crash-safety implication — worst case is a rejected order, not a citation or a rollover. Freight industry usage of "cube out" vs. "weigh out" (Warp, Speed Commerce, Buske glossaries) treats volume purely as a packing/space problem. A tighter margin close to 95–98% is defensible here, since the only real-world slack you need is for imperfect packing geometry (boxes don't tessellate) and last-minute additions — not driver safety.

**Recommendation**: change `SAFETY_MARGIN = 0.93` (applied to both dimensions) to two constants: `WEIGHT_SAFETY_MARGIN ≈ 0.85` and `VOLUME_SAFETY_MARGIN ≈ 0.95`. Make both configurable per vehicle class if/when Venezuela and Costa Rica fleets turn out to need different buffers (e.g., motorcycles may warrant a lower weight margin than trucks, since small load-distribution errors matter more on two wheels) — but don't build that configurability speculatively; start with two constants.

None of the researched TMS products (below) publish a fixed "safety margin" number — they expose capacity as a hard constraint and let the customer configure the vehicle's usable capacity directly (i.e., the operator enters "effective" capacity already discounted, rather than the tool applying an invisible haircut). That argues for eventually surfacing the margin as an editable per-vehicle setting rather than a hardcoded constant, but that's a UI decision, not something to build now.

### How real products structure optimization (research summary)

| Product | Inputs used | Algorithm class (as published) | Capacity/safety handling |
|---|---|---|---|
| Onfleet | time windows ("complete after/before"), service time, driver schedules, vehicle capacity vs. task quantity, vehicle type, max tasks/route, traffic | VRP solver (proprietary, described generically as "VRP") | Hard capacity limit compared to task quantity field; no published safety buffer — operator sets the usable number |
| Routific | time windows (hard by default, optional overtime/late tolerance), vehicle capacity, shift times, driver tags (vehicle type/skills/certs), historical traffic | Metaheuristics for "Rich VRP" (their term) once shifts + load types + service durations combine | Capacity and shift limits set directly by customer; no separate margin concept |
| Circuit | delivery priorities, service times, multi-driver splitting, depot reload/no-return-to-depot cases | VRP/TSP-class, real-time re-optimization | Priority stops as first-class inputs; no published capacity-safety-margin feature |
| OptimoRoute | load capacity by weight, volume, units (boxes/pallets), or passengers; priority levels, time constraints, skills, day/date ranges, hazmat/truck-dimension routing | CVRP-class ("Capacitated Vehicle Routing Problem" — they publish an explainer under that exact name) | Capacity is a hard per-vehicle number the customer sets (weight/volume/units); "lock route" feature freezes a driver's route while re-optimizing the rest — no separate safety margin |
| Samsara | (unable to retrieve detail — search unavailable during this session; flagged as a gap) | — | — |
| Track-POD | ETA, vehicle capacity/availability, order destination; overload pre-notification when dragging orders onto a route | VRP-class | Warns dispatcher when a manual edit pushes a route over capacity — reactive warning, not a proactive margin |
| Urbantz | not retrievable in this pass (gap) | — | — |
| Locus | 250–280+ simultaneous constraints (SLA tier, rider/vehicle location & history, vehicle capacity/type, hub throughput windows, cost-per-delivery, live traffic) via "DispatchIQ" | AI/ML + constraint-based dispatch, proprietary | Capacity/type matching is one of many weighted constraints, not a separate safety-buffer mechanic |

**Pattern across all of them**: none hide a hardcoded safety-margin percentage inside the algorithm. Capacity is a hard, user-configured number (whatever the operator says the vehicle can safely carry), and priority/lock features are separate, explicit concerns. This validates moving the margin from a code constant toward a configurable field — but as noted, that's a follow-up, not urgent.

### "Locked" / "must-include" stops — is this a real pattern?

Yes, and the current `anclados` implementation matches common practice reasonably well:

- OptimoRoute has a **"lock route"** feature: freeze specific drivers'/routes' assignments while the rest of the plan re-optimizes around them.
- Circuit and generic VRP tooling support **priority stops** that the optimizer is constrained to include, sequenced relative to everything else.
- Arrivy and comparable tools expose **"locked start times"** and fixed waypoints as a named, first-class constraint, not a workaround.

Naming in the wild clusters around "locked," "pinned," or "priority" — `anclados`/"anchored" (our current term) is a reasonable Spanish equivalent and doesn't need to change. One UX pattern worth copying: several tools visually pin locked stops at a fixed position in the route list/map and show a "why can't I move this" indicator when a lock forces an otherwise-suboptimal sequence — that's a cheap trust-building affordance if the module gets a real UI.

### What to build next — prioritized for this business (CR/VE, ≤50 stops, 12–36 routes/day, mixed fleet)

1. ~~**Multi-vehicle order-pool splitting (fleet-level assignment, not one vehicle at a time).**~~ **Implemented 2026-08-12.** Every mature product treats this as the core problem (VRP = *multi*-vehicle by definition; Split Delivery VRP literature exists specifically for demand > single-vehicle capacity). At 12–36 routes/day across a mixed fleet, planning one vehicle in isolation forces a human to manually decide which orders go to which vehicle before the tool even runs — the single highest-leverage gap. Shipped as a new "Reparto de Flota" tab: pick a route type, add N vehicles (each with an optional driver), the pool of pending orders is split across them with a sequential largest-vehicle-first greedy fill (`src/pages/planificacion/fleet-split.ts`, reusing the same weight/volume safety-margin bin-packing as the single-vehicle flow), each vehicle's assigned orders get sequenced, and all N routes are generated at once. Orders that don't fit any selected vehicle are reported explicitly rather than silently dropped. Known simplification: driver/transportista assignment per vehicle is optional and not required by the algorithm — a real deployment would likely want to require it.
2. ~~**Per-stop delivery time windows.**~~ **Implemented 2026-08-25.** Every researched product (Onfleet, Routific, Circuit, OptimoRoute) treats time windows as a first-class, often hard constraint. Merged from `src/lib/routePlanning/plan-route.ts` into the active UI: `distance-matrix.ts` now requests OSRM durations alongside distances, a new `time-windows.ts` module walks the clock forward from 8:00 through the stop sequence using real travel durations + 5 min service time per stop, each `PedidoSeleccionado` gets an `eta_min` / `outside_window` flag, and `ParadaCard.tsx` shows the ETA with a red badge when outside the 8:00–19:00 window. A warning toast fires when any stop exceeds the window. Known simplifications: flat 5-min service time per stop (not per-package); 30 km/h assumed speed in haversine fallback; no per-customer custom windows yet (defaults to 8–19 for all).
3. **Driver shift-length / hours-of-service limits.** Routific and OR-Tools both model this explicitly (break/active-time dimensions). With up to 50 stops and mixed vehicle types, a route that's capacity-and-time-window feasible can still be undriveable in a legal shift — this is a correctness gap, not a nice-to-have, once time windows land.
4. **Zone/cluster-based dispatch as a pre-step for (1).** K-means-style geographic clustering before per-cluster VRP is the standard way products make multi-vehicle splitting tractable at this stop count — worth building alongside item 1, not after.
5. **Real driving-distance/duration (Google Maps).** Already scoped and prototyped separately in `src/lib/routePlanning/google-distance-matrix.ts` — just needs merging into the active UI. Noted per the request, not re-researched here.
6. **Vehicle-type/skill matching (e.g., which orders require truck vs. moto, cold-chain, oversized).** Locus and Routific both support this as tag-based matching. Relevant given the fleet spans motorcycles to trucks — an order that "fits" a truck by weight/volume may still be physically wrong for a moto (fragile, oversized, needs a covered box).
7. **Cost/fuel-vs-time trade-off optimization.** Lower priority at current scale — this matters more once multi-vehicle balancing (item 1) is mature and there's a real choice between route shapes to trade off; premature before that.

## Considered alternatives

- **Keep 93% for both weight and volume.** Rejected — no source found supports 93% for weight; every fleet-management source caps around 80–85%. Keeping it risks routine near-max loading that real carriers deliberately avoid.
- **Drop the safety margin entirely and let capacity be a hard 100% cutoff.** Rejected — this is closer to how OptimoRoute/Onfleet actually work (operator sets the real usable number), but it silently pushes the safety-margin decision onto whoever enters vehicle capacity data, with no guardrail. Splitting weight/volume margins keeps a sane default while the module is still a prototype.
- **One shared margin applied differently per vehicle class instead of per dimension.** Rejected for now — real signal points to weight vs. volume being fundamentally different constraint types (regulatory/safety vs. purely spatial); per-class tuning can layer on top later if data shows it's needed, but per-dimension is the more evidence-backed first cut.

## Consequences

- **Positive**: capacity math now has a stated rationale instead of an invented number; the prioritized backlog gives the team a research-backed order of work instead of a generic feature wishlist.
- **Negative**: raising the volume margin to 95% and lowering the weight margin to 85% changes which orders get included/excluded compared to today's flat 93% — will shift real routing outcomes and needs a decision from whoever owns the module before it's coded.
- **Neutral**: ~~this doc does not implement anything~~ — implemented 2026-08-12: `capacity-fit.ts` now uses `WEIGHT_SAFETY_MARGIN = 0.85` and `VOLUME_SAFETY_MARGIN = 0.95` in place of the flat `SAFETY_MARGIN = 0.93`.

## Migration notes

Implemented 2026-08-12 in `src/pages/planificacion/capacity-fit.ts`: `SAFETY_MARGIN` replaced with `WEIGHT_SAFETY_MARGIN` (0.85) and `VOLUME_SAFETY_MARGIN` (0.95), applied separately in `seleccionarPorCapacidad`. The prioritized backlog (multi-vehicle splitting, time windows, driver hours, clustering, real distance, vehicle-type matching, cost trade-off) remains open — tracked here, not yet started.

## Open coordination points

- **product-strategist / whoever owns CR & VE ops**: confirm 85%/95% are acceptable starting defaults, or supply real fleet data (weight-distribution incidents, cube-fill rates) to tune them further.
- **frontend-architect**: if capacity margins become per-vehicle configurable fields (matching how OptimoRoute/Onfleet expose this), that's a schema and UI decision outside this doc's scope.
- **Gaps in this research**: Samsara Route Planner and Urbantz could not be retrieved in this session (web search intermittently unavailable) — worth a follow-up pass if those two matter competitively.
