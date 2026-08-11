---
inclusion: auto
---

# crew automatic role routing (MANDATORY)

The user does not need to choose a role. For every request, silently route each decision to the role that owns it, load only the context needed, and return one integrated answer.

## Default behavior: automatic

When no role is named:

1. Identify the decision units in the request. A task may contain more than one decision, but each decision has exactly one owner.
2. Choose one primary role per decision from the ownership map below.
3. Use the matching Kiro custom subagent automatically when isolated specialist reasoning, repository exploration, or parallel work materially improves the result. For a simple question, read the canonical role file and apply its lens directly instead of delegating.
4. Add a secondary role only when its distinct authority is concretely implicated. Do not assemble a committee for routine work.
5. Run independent consultations in parallel; keep dependent handoffs sequential.
6. Integrate all conclusions into one response. Do not make the user coordinate the crew or repeat the request.
7. Mention which roles were used only when it helps explain a trade-off, verdict, or handoff.

Custom subagents live in `.kiro/agents/<role>.md`. Canonical role definitions live in `agents/<role>.md`. If custom subagents are unavailable, read the canonical role definition and reason through that lens in the main context.

## Explicit overrides

Explicit routing remains available but is optional:

- `ALIAS:` or `Role Name:` pins that role as primary for the current message.
- A manual `#role` steering reference pins the same lens.
- `GEN:` requests a generalist answer for the current message; mandatory security and UI-design triggers still apply.
- An explicit role does not authorize authority drift. Consult another role automatically if a complete answer requires it, then integrate the result.

## Ownership map and routing signals

| Alias | Custom agent | Route here when the request primarily concerns |
|---|---|---|
| `COM` | `commercial-strategist` | Client need discovery, commercial viability, project manifesto, positioning, public-site message or sitemap |
| `PROD` | `product-strategist` | What to build, for whom, why now, roadmap, priority, product scope, success outcomes |
| `FA` | `functional-analyst` | User stories, acceptance criteria, behavioral edge cases, functional readiness or validation |
| `COORD` | `delivery-coordinator` | Cross-role sequence, blockers, handoffs, delivery status, intent fidelity |
| `DEA` | `data-experience-architect` | What information a screen needs, hierarchy, filters, actions, informational gaps |
| `UX` | `ux-architect` | Layout, interaction, accessibility, visual hierarchy, design system, rendered design quality |
| `SYS` | `system-architect` | Cross-module architecture, API contracts, layering, integrations, extension contracts |
| `DA` | `data-architect` | Schema, relationships, constraints, indexes, migrations, query/data integrity |
| `FE` | `frontend-architect` | Frontend state, data fetching, routing, forms, component boundaries, bundle/runtime strategy |
| `SEC` | `security-compliance` | Sensitive data, authentication, authorization, tenancy, consent, retention, regulatory exposure |
| `QA` | `qa-test-architect` | Test strategy, fixtures, coverage intent, regression, or post-implementation compliance verdict |
| `OPS` | `platform` | Releases, versioning, CI/CD, infrastructure, environments, SLOs, observability, runtime performance |
| `ANA` | `analytics-architect` | Events, KPI formulas, funnels, instrumentation, analytical models, experiment measurement |
| `DOC` | `documentation-steward` | Documentation taxonomy, placement, navigation, lifecycle, drift, developer-facing docs |
| `RES` | `researcher` | Read-only repository reconnaissance, inventories, traces, locating or explaining existing behavior |
| `CREW` | `crew` | This catalog, role boundaries, Kiro installation, activation, packaging, or shared crew rules |
| `API` | `dx-architect` | External API/SDK ergonomics, onboarding, error surface, public versioning and deprecation |

`writing` is a horizontal skill, not a role. Load it when the success of a document depends on audience, narrative, tone, or persuasion; the domain owner remains primary.

## Mandatory cross-cutting triggers

- **Sensitive data or permissions:** include `security-compliance`; it may block another role's proposal.
- **UI creation or modification:** consult `ux-architect` before implementation. If the screen's information is unsettled, route to `data-experience-architect` first.
- **Schema plus API:** `data-architect` owns the model; `system-architect` owns the contract. Neither absorbs the other.
- **Implementation verdict:** `qa-test-architect` compares delivered work with the specifications authored by the owning roles.
- **Repository exploration:** use `researcher` for evidence only. It never recommends or owns a decision.
- **Public API/SDK:** activate `dx-architect` only when external developers are genuine consumers.

## Composition rules

- One owner per decision; multiple roles may contribute different decisions.
- The primary owner resolves recommendations within its authority. Secondary roles supply constraints, evidence, or independent judgments.
- Specs and decisions precede code when the direction is not already settled. Do not force ceremony for a small, explicit implementation request.
- Custom subagents return specialist conclusions to the main agent. They do not coordinate other agents; the main agent owns orchestration.
- Do not defer work the crew can complete now. Escalate only product, risk, scope, or approval decisions that genuinely belong to the human.
- Keep routing proportional: no subagent for a fact already established in context; no exhaustive repository scan for a local question.

## Retired aliases

Interpret these as redirects without asking the user to learn new names:

`PERF`/`REL`/`INFRA` → `OPS` · `SC` → `QA` · `WEB` → `COM` · `VIS` → `UX` · `MOD` → `SYS` · `CA`/`INST` → `CREW` · `DX` → `API` · `LEA` → `RES` · `COMM` → `writing` skill.
