# Mob Composition & Agent Recommendation — TMS OLO

> Framed with the Team Topologies model (`aidlc-delivery-agent`'s own
> knowledge base) and the mob-programming heuristic table. This is where the
> concrete answer to "qué agentes crear" lives — see §3.

## 1. Team topology today (already correct, keep it)

The team already organized itself as **stream-aligned teams of one**, one
person per module (`CONTEXTO_PROYECTO_TMS.md` §5.1, Reunión 6: "cada
desarrollador trabaja en su propia rama por módulo"). Mapped to Team
Topologies:

| Team Topologies type | Who / what | Notes |
|---|---|---|
| Stream-aligned (×5) | Justin (Tracking) · Dylan (Liquidación) · Jesús (Planificación) · Eduardo (OMS) · [sin dueño] (Devoluciones, Guías, Flota, Backhaul, Contratos, Reportería, Configuración) | Below the recommended 5-9 headcount per stream — each is a *stream of one human + their AI agent*, not a squad. That is fine at this stage (prototype/Ideation), but is the reason mobbing (§2) matters more here than in a normal-sized team: there is no second human to catch what the first misses. |
| Platform | Jean Carlo (infra, superuser, DB/schema-by-agent-and-PR) | Correctly framed as "internal service" per Conway's Law — every stream depends on his infra decisions. Risk: he is *also* doing platform work solo (see `skill-matrix.md` bus-factor gap). |
| Enabling (transversal) | Andrey (RLS/seguridad) | Textbook enabling-team shape: helps every stream acquire a capability (fine-grained permissions) they cannot each build alone. |
| Complicated-subsystem (candidate) | OMS priority engine (Eduardo) | The kickoff itself called OMS a "mini-proyecto dentro del proyecto" and a "satélite" — matches the Complicated-Subsystem pattern (deep, business-critical logic that the rest of the TMS should *consume*, not re-implement). Justifies giving it its own specialist agent (§3). |

**Recommendation:** do not restructure. The stream-aligned-per-module shape is
already right for a 6-person team at Ideation/Inception. What is missing is
not team structure — it is the **agent layer** each stream should have
alongside it (§3), and a couple of specific moments that call for mobbing
instead of solo work (§2).

## 2. When to mob (not the default — specific moments only)

Per the mob-programming guide's own heuristic table, mob only where
uncertainty is genuinely high or knowledge is siloed:

| Moment | Who | Why mob, not solo |
|---|---|---|
| OMS rule engine design (Regla 1 + Regla 2 + the open "automatizar vs. rediseñar el flujo" question) | Eduardo (driver) + Jean Carlo (navigator, flujo de datos) + Ana/Andrey (navigator, gobernanza/roles) | Complex design decision + unfamiliar-to-the-team domain (priority engine) + the governance model already flipped once (aprobación humana → 100% automático) — a second and third set of eyes reduces the odds of building against a stale requirement again. |
| OMS ↔ Planificación data contract | Eduardo + Jesús | Cross-team knowledge is siloed by definition — each owns one side of the contract and neither can validate it alone. |
| Multi-country/multi-company DB schema shape (same-tables-with-ID vs. schema-per-company vs. DB-per-company — flagged `DECIDED (parcial/pendiente)` in `project.md`, still open) | Jean Carlo + whoever ends up owning the Python/Lambda backend build | Genuinely undecided architectural fork with long-lived consequences — exactly the "complex design decision" row of the mob-programming table. |
| Python/Lambda/SAM onboarding (if the team, not Intelix, absorbs it — see `skill-matrix.md` gap 1) | Whoever ramps up + Jean Carlo | "New team member onboarding" / "unfamiliar technology" — the guide's two clearest mob triggers. |

Everything else (day-to-day module CRUD, catalog screens, most of the
existing prototype work) stays solo-per-module, as it already is.

## 3. Agent recommendation — the actual answer to "qué agentes crear"

`CONTEXTO_PROYECTO_TMS.md` §6 already proposed a list of agents (Andrey's,
blocked on Ana's module mapping) and warned explicitly against over-building
("si se generan de más, después hay que estar modificándolos, y eso es justo
lo que se quiere evitar"). Combining that list with the gap analysis in
`skill-matrix.md`, here is a **minimal, non-duplicative** set — only where
AI-DLC's own 14 lifecycle agents (`.claude/agents/aidlc-*-agent.md`) do not
already cover the need:

| # | Agent to build | Type | Why it's not redundant with AI-DLC's existing agents | Priority |
|---|---|---|---|---|
| 1 | **OMS domain specialist** | Custom (non-`aidlc-*`, so it is never confused with the framework's own lifecycle agents) | AI-DLC has no domain-specific agents — its 14 are lifecycle roles (product/architect/developer/...). This one project needs a standing source of truth for the OMS's own rules (100%-automatic priority engine, numeric priorities, T-1 dispatch rule, the 5 macro-rules, scope ending at "alistado") so neither a human nor another agent builds against the superseded human-approval version again. | **Highest — explicit ask of this run ("el OMS es sumamente delicado")** |
| 2 | **Database/schema agent** | Custom | Already informally proven in this same working session (Aurora PostgreSQL schema + migrations + a generic query/mutation engine, all reviewed before applying) — but that pattern lives in one session's memory, not as a reusable agent. Formalizing it matches the kickoff's own stated workflow ("se hace pidiendo a un agente de Claude que genere las tablas... todo pasa por PR"). | High |
| 3 | **RLS/security specialist (for Andrey)** | Custom | `aidlc-compliance-agent` is generic (regulatory/audit framing); this project's RLS model is specific (per-button permission granularity for Liquidación, org-scoped access for OMS roles) and was explicitly requested by Andrey in Reunión 6. | High — unblocks Andrey directly |
| 4 | **Documentation/roadmap agent (for Ana)** | Custom | AI-DLC's `aidlc-session-cost`/`aidlc-outcomes-pack` report on *this* project only; Ana tracks ~40 projects. Out of scope for AI-DLC by design — a separate, lighter-weight agent (or even a simple periodic report script) is the right shape, not a 15th lifecycle stage. | Medium |
| 5 | Visual-consistency skill | Not a new agent | Already "en construcción" per Reunión 6 — track it as a skill, not a subagent; no need to duplicate work already in flight. | — (tracking only) |
| 6 | Per-module business-rule agents (e.g., Liquidación for Dylan) | **Not recommended yet** | Explicitly the kind of over-building the kickoff warned against. Build only once a module's own rules are as settled as OMS's now are (post-2026-09-10 "Decided" log) — Liquidación's tarifario is still being modeled (n×n combinable, §2.3 of the context doc), so a rules agent for it today would need constant rework. | Defer |

### Why not just add more `aidlc-*-agent.md` files

The 14 shipped agents are the framework's *lifecycle* roles (one per SDLC
phase/responsibility) — adding a 15th generic role does not solve the actual
gap, which is **domain knowledge specific to this TMS** (OMS's rules, this
project's RLS model, this project's DB conventions) that no lifecycle-generic
agent carries. Keeping the new agents outside the `aidlc-` naming/`.claude/
agents/aidlc-*-agent.md` convention keeps that distinction visible: framework
roles vs. this-project's-own domain specialists.

## 4. Immediate unblock

Andrey's blocked agent list (Reunión 7) needed Ana's module-ownership mapping
before he could finalize it "sin sobre-construir." `team-assessment.md`'s
roster table **is** that mapping, sourced from the same document Ana would
have used. Sharing it with Andrey directly (rather than waiting on a separate
confirmation loop) is the fastest unblock available right now, with the
caveat that Ana remains the owner of the "official" mapping if it has changed
since `CONTEXTO_PROYECTO_TMS.md` was written.
