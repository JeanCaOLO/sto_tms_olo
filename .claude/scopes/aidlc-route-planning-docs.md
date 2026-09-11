---
name: route-planning-docs
depth: Minimal
keywords: []
description: Reverse-engineer and document an existing module (no code changes)
skeleton: off
review_cap: advisory
---

# route-planning-docs scope

Minimal depth aimed at producing requirements documentation for an already-
built module, with no design ceremony and no code generation. Reconstructed
2026-08-31 after the compiled scope grid was found missing this scope's
registration — the intent that used it (`260825-route-planning-reqs`, run by
Kiro) predates this repo's scope-grid compilation and never got its
`.claude/scopes/aidlc-route-planning-docs.md` + `scope-grid.json` entry
committed, which blocked the orchestrator (`Unknown scope
"route-planning-docs"`) for every intent, not just this one.

## Why these stages, why skip those

Documenting a brownfield module that already works needs only: capture the
intent, reverse-engineer the existing code, write the requirements from what
was found, and get sign-off. No mockups (the UI already exists), no domain
design, no delivery planning, no construction or operation phases — nothing
here is being built.

## Membership

No keyword triggers (`keywords: []`) — this scope is not meant to be
auto-detected for new work; it exists to keep the historical
`260825-route-planning-reqs` intent resumable. Initialization,
intent-capture, reverse-engineering, requirements-analysis, and
approval-handoff execute; everything else is SKIP.
