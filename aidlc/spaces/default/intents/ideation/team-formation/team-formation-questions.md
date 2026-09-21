# Team Formation — Clarifying Questions

> Per `stage-protocol.md` question format. Answered from existing, sourced
> project knowledge where available (see `memory.md` "Deviations" for why no
> live interactive round was run); genuinely open items are marked as such
> and use the `[Answer]:` tag for the human to fill in directly in this file.

## 1. What teams and individuals are available?

Answered — see `team-assessment.md` §"Team availability". Six developers
(Jean Carlo, Justin, Andrey, Dylan, Jesús, Eduardo), one module each plus
Jean Carlo's platform/superuser role and Andrey's transversal RLS role.

## 2. What is the current capacity and utilization?

**[Answer]:** No hours/week, PTO, or % allocation data exists in any source
document. _______________________________________________

## 3. What skills are required vs. available?

Answered — see `skill-matrix.md`. Headline gap: the whole team is
React/TypeScript, the official Construction stack is Python/Lambda/SAM
(`project.md`, Decided 2026-09-03) and no capacity plan for that gap exists
yet.

## 4. Are there competing initiatives drawing from the same talent pool?

Partially answered — Andrey's RLS work is transversal and competes with every
module in active construction (OMS, Planificación, and the just-started
Devoluciones per the roadmap in `2026-08-26-reunion-oms-roles.md`). No other
competing-initiative data found.

## 5. What is the preferred team topology?

Answered — see `mob-composition.md` §1. Current shape (stream-aligned per
module + one platform role + one enabling role) already matches Team
Topologies guidance; recommend keeping it.

## 6. What time zones and locations are team members in?

Partially answered — Costa Rica and Venezuela (Dylan is explicitly based in
Venezuela); meeting cadence confirms both time zones are actively
coordinated. Per-person location for the rest of the team is not documented.

**[Answer]:** Confirm per-person location/time zone for Jean Carlo, Justin,
Andrey, Jesús, Eduardo if it affects scheduling. _______________________

## 7. Are external partners, contractors, or AWS Professional Services needed?

Partially answered — Intelix provides advisory specialists (architecture, DB,
apps, security) and is the **exclusive** deployer per the official-stack
decision (`project.md`, 2026-09-03/04). Ricardo (ex-Walmart logistics) is an
external consultant feeding business rules into Liquidación and Planificación
context. No AWS Professional Services engagement is documented.

**[Answer]:** Given the team-wide Python/Lambda/SAM gap (`skill-matrix.md`
gap 1), does Intelix's role extend to writing that backend code, or only to
deploying what the current team writes? This materially changes the skill
gap's severity. _______________________

## 8. Who are the decision-makers for each phase?

Partially answered:
- Business/scope: Palencia (coordinación), plus the client-side "funcionario"
  referenced in the OMS meeting notes for formal business-rule sign-off.
- Documentation/roadmap/PM: Ana (Intelix).
- Technical/architecture: Jean Carlo, with Javier ("Javi", Intelix
  architecture team) for the AWS/AIDLC standard itself.
- Per-module: each module owner (Dylan, Jesús, Eduardo, Justin) for their own
  domain; Andrey for RLS/security sign-off across modules.

**[Answer]:** Confirm who has final sign-off authority to move a module from
Inception to Construction (Jean Carlo alone, or a joint call with
Ana/Palencia?). _______________________

## Additional open items surfaced by this analysis (not standard stage
questions, but load-bearing)

- **[Answer]:** Is `aidlc/spaces/default/intents/260826-modulo-oms`'s
  in-progress `domain-design` stage aware of the corrected `project.md`
  "Decided" entries dated 2026-09-01 through 2026-09-10 (numeric priorities,
  TMS-owns-the-route-calendar not OMS, rules-engine-is-code-not-a-UI-builder,
  OMS-ends-at-"alistado")? These postdate some of the assumptions in
  `PLAN_MODULO_OMS.md`. _______________________
- **[Answer]:** Should this team-formation output be promoted into a real
  AI-DLC intent (so it is not orphaned at the bare-space level), or does it
  stay as a one-off reference document? _______________________

## Mandatory closing question (stage-protocol.md §13)

**Anything to add for next time?**

**[Answer]:** _______________________
