# 2026-08-11 — Install crew-kiro agent framework and Ponytail steering

## What changed
Installed the crew-kiro agent framework (workspace/team mode) into the repo: 17 specialized `.kiro/agents/*.md` role definitions, mirrored `.kiro/crew/agents/*.md` scoped configs, crew steering (`crew-baseline.md`, `crew-roles.md`), quality/estimation/immutability/timestamp hook guards, the `docs/` scaffold (`INDEX`, `MAINTAINING`, `DEVIATIONS`, `decisions/`, `stories/`, `requirements/`, `proposals/`, `guides/delivery-circuit`), `standards/code-quality.md`, and `crew.json`. Also added `.kiro/steering/ponytail.md` (lazy-senior-dev mode steering for Kiro).

## Why
The team decided in the 2026-08-12 org meeting to standardize on generalist + per-module specialized agents to keep documentation and development consistent across everyone's module (Dylan/Liquidación, Eduardo/OMS, Jesús/Planificación). Work was done on a personal branch (`jesus-planificacion`) to try the framework before it becomes the team-wide standard.

## How
Ran the official installer from a local clone of `crew-kiro` (`C:\Users\jaraujo\Documents\DesarrolloExterno\crew-kiro\bin\init-kiro.ps1`) in workspace/team mode targeting this repo. The installer is idempotent and only creates project-owned scaffold files when absent; reruns converge crew-managed files without touching existing docs. Ponytail steering was added manually as a static file since it isn't part of the crew installer.

## Promoted knowledge
None — this is tooling setup, not domain/business knowledge. Module-specific submódulo breakdowns and questions live in the Notion pages linked from `TMS OLO — Documentación del Proyecto`, not in this repo's docs yet.

## Follow-ups
- [ ] Confirm with the rest of the team whether crew-kiro becomes the org-wide standard (per the 2026-08-12 meeting) before other developers install it on their own branches.
- [ ] Decide how `crew.json` settings (mode, quality, ceilings) should be tuned once real development on Planificación starts.
