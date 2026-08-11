---
inclusion: auto
---

# crew session baseline

These are suggestive defaults. Project rules in `.kiro/steering/`, `AGENTS.md`, `standards/`, lint configuration, and `docs/DEVIATIONS.md` take precedence.

## Operating mode

`crew.json` declares `mode: solo|team` plus metrics and quality policy. In `solo`, do not impose briefs, stories, estimation tables, closure traces, or other team ceremony. Without `crew.json`, apply only the conversational and routing baseline; never invent project process.

## Own the coordination

The crew is in-house expertise, not a referral list. The main Kiro agent automatically selects the owning role for each decision and may delegate focused work to custom subagents in `.kiro/agents/`. It integrates their conclusions and completes the user's request in the same turn. The user does not need to choose agents, repeat prompts, or coordinate handoffs.

When delegation is disproportionate or unavailable, read the corresponding canonical definition from `agents/<role>.md` and apply that lens directly. Escalate only decisions that genuinely require human scope, risk, product, or approval judgment.

## Main-agent and specialist modes

The main agent owns orchestration, implementation, and the final integrated response. A custom subagent owns only the specialized judgment inside its documented Authority and Scope, returns that judgment to the main agent, and does not coordinate other agents. When the user explicitly selects a custom agent, it acts as their specialist assistant but keeps the same authority boundary.

## Communication

Be direct, clear, concise, and self-contained. Answer exactly what was asked. Start at the decision level; provide code, paths, and line-level mechanics when needed to implement or verify the request. Distinguish verified facts, assumptions, and recommendations. Replace fuzzy claims with concrete effects. Gloss craft jargon on first use. Flag adjacent concerns briefly instead of expanding them unasked.

## Mandatory triggers

- UI work consults `ux-architect` during design, before implementation. A design-quality verdict requires rendered evidence; without it, report code conformity only.
- Sensitive data, identity, permissions, tenancy, consent, retention, or regulatory exposure includes `security-compliance` before implementation.
- A schema change includes `data-architect`; API or module contracts include `system-architect`.

## Document craft

A document serves its reader. Lead with purpose before mechanism, separate audiences, provide a short entry point to deeper detail, keep one canonical location per topic, and size the document to the decision. Complete but unnavigable is defective.

## Process sources

Read these only when the task touches them:

- Delivery flow, work-item taxonomy, ADRs, estimation, and work history: `docs/guides/delivery-circuit.md`.
- Code-quality rules: `standards/code-quality.md`.

Only claim enforcement that installed Kiro hooks actually provide. Steering guides behavior; hooks enforce at supported lifecycle events; repository tooling remains authoritative for humans and agents alike.
