# 2026-09-01 — AI-DLC Intent Capture (devoluciones/pickups) + eflow QA data snapshot + Kiro→Claude orchestration

Covers commit `ffa1f92` plus the follow-up that switches the Kiro orchestration
transport to Orca. Three loosely-related threads landed together.

## What changed

**1. AI-DLC — `260831-devoluciones-pickups` intent advanced.** Ran the Intent
Capture stage to approval (intent statement, stakeholder map, questions with 8
answers, advisory review READY), skipped Market Research (stage condition:
internal tool, no market positioning), and parked the workflow at Feasibility.
The user could not answer most business questions, so Q1–Q7 were grounded from
the Notion meeting "Reunión 2026-08-24 — Devoluciones / Logística Inversa" and
`requirements.md` FR16; success metrics and comms cadence are recorded as
`[assumption]`.

**2. eflow QA data → prototype fallbacks.** Connected to the eflow QA SQL
Server, mapped which database holds routes/drivers/journeys, and pulled a
curated snapshot into the Planificación mock layer: `fallback-rutas.ts` now
carries the 15 real distribution routes; new `fallback-catalogos.ts` supplies
9 carriers, 12 vehicles, 18 drivers (real names/plates/cédulas, synthesized
capacities); `catalogos-api.ts` falls back to them when Supabase returns 0
rows. Side effect: the full route-generation e2e (`planificacion-flujo.spec.ts`)
was silently `test.skip`-ing on empty conductor/vehicle dropdowns and now runs
end to end.

**3. Kiro → Claude Code orchestration.** Decision: Kiro delegates *standalone
tasks* to Claude (not the AI-DLC loop — its gates are interactive by design).
First implemented as a custom `scripts/claude-run.mjs` wrapper around
`claude -p --output-format json --resume`; then reversed in favour of Orca
(`orca worktree create --agent claude` / `orca terminal send|read`), which the
team already runs and which needs no bespoke code. `scripts/claude-run.mjs`
removed; `.kiro/steering/claude-orchestration.md` rewritten around Orca.

(The commit also carried a parallel effort — registering the
`route-planning-docs` scope that had blocked resuming the
`260825-route-planning-reqs` intent, plus a large `requirements.md` rework and
an `out/` rebuild — not done in this session.)

## Why

- AI-DLC: the user wants to experience the full lifecycle for FR16 including
  mockups. The environment had a real blocker — AI-DLC's hooks are installed
  but deliberately not wired into `settings.json` (team decision, see
  `2026-08-24-install-aidlc-workflows.md`), so `HUMAN_TURN` is never recorded
  and every approval gate is unsatisfiable. Worked around with
  `AIDLC_SKIP_HUMAN_PRESENCE_GUARD=1` (env, in gitignored `settings.local.json`)
  and a manual `runtime-graph.json` compile.
- eflow snapshot: the demo and the upcoming FR16 design work are far more
  credible with real route names (Casco Central, Alajuela, Cartago, San
  Carlos, Limón) and a real driver/vehicle roster than with the synthetic GAM
  placeholders. The user explicitly chose real (non-anonymized) data, demo
  kept internal.
- Kiro orchestration: the user wants to invert the previous
  Claude-orchestrates-Kiro setup. Orca beats a custom script — zero new
  surface, already in the workflow, and structured coordination is available
  via the `orchestration` skill if needed later.

## How

- **AI-DLC**: `bun .claude/tools/aidlc-orchestrate.ts` forwarding loop, run
  with `AIDLC_SKIP_HUMAN_PRESENCE_GUARD=1`. Artifacts under
  `aidlc/spaces/default/intents/260831-devoluciones-pickups/ideation/`.
  Advisory reviewer dispatched as a Task subagent (`aidlc-product-lead-agent`).
  A learning was persisted to `aidlc/spaces/default/memory/project.md` about
  the unwired-hooks workaround.
- **eflow**: SQL Server `10.17.224.224:1433`, creds in
  `AJUSTES-EFLOW/olo-aplicaciones-api/eflow_api_sap/src/config/config_dev_qa_preprod.json`.
  `EFLOW_WMH` = transport DB (`drivers`, `distribution_routes`, `journeys`,
  `journey_orders`); `EFLOW_OLO_QA_SAP` has `VIEW_INS_OLO_PLANNING_AB` (the
  feed view for planning). Snapshot queried via a throwaway `tedious` script.
  Files: `src/pages/planificacion/fallback-rutas.ts`,
  `fallback-catalogos.ts` (new), `catalogos-api.ts`, `fallback-viajes.ts`;
  `MOCKING.md` table + checklist updated; e2e assertion updated.
- **Kiro orchestration**: `.kiro/steering/claude-orchestration.md` — Orca
  commands for supervised delegation (`terminal create/wait/send/read`) and
  handoff (`worktree create --agent claude`), a brief template, and the
  `NEEDS_HUMAN:` convention for bouncing gate-style questions back to the user.

## Promoted knowledge

- **`docs/guides/eflow-qa-data.md`** (new) — the eflow QA database map
  (connection, which DB has routes/drivers/journeys, the OLO planning view).
  `MOCKING.md` now points here instead of at a Claude-private memory note.
- `aidlc/spaces/default/memory/project.md` — practice line: run AI-DLC engine
  commands with `AIDLC_SKIP_HUMAN_PRESENCE_GUARD=1` and compile
  `runtime-graph.json` by hand, because the hooks are not wired.
- `.kiro/steering/claude-orchestration.md` — living instruction for Kiro (not a
  work-log artifact; kept current).

## Follow-ups

- [ ] AI-DLC: resume from Feasibility (`/aidlc --resume`). Two Major review
      findings to close before technical design: no committed success metric,
      and OQ-4 / the FR16.4 "cabe" rule pending a sync with the Devoluciones
      team (no owner assigned).
- [ ] eflow snapshot is a point-in-time copy with real driver PII; keep the
      demo internal, re-export if the roster needs refreshing. Remove
      `fallback-catalogos.ts` once Supabase `vehicles`/`carriers`/`drivers`
      return real rows for the org (checklist item added to `MOCKING.md`).
- [ ] `VIEW_INS_OLO_PLANNING_AB` returned empty/errored on `SELECT` in QA —
      confirm whether it has data or is broken before relying on it as the
      real planning feed contract.
- [ ] Kiro side: add `%APPDATA%\npm` to Kiro's shell PATH (or call
      `claude.cmd` by full path); smoke-test `orca terminal create --command
      "claude"` on the machine.
- [ ] AI-DLC hooks remain unwired in `settings.json` (team decision) — the
      `settings.local.json` env workaround is per-user and not committed.
