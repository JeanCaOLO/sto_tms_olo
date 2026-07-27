# Dependency graph state machine

## Declaring a dependency

Two ways an edge `issue N depends_on issue M` enters `dependency_state.json`:

1. **Manual** — `dependency_graph.py link --issue N --depends-on M --reason "..."`.
   Use this when a human tells you about a dependency ("el pago depende de la
   migracion de ordenes"). `source: "manual"`, never overwritten by discovery.
2. **Discovered** — `dependency_graph.py discover` scans every open issue body for
   the patterns `Depends on: #12`, `Blocked by #12`, `Depende de #12`,
   `Bloqueado por #12` (case-insensitive). `source: "discovered"`.

Do **not** auto-infer a dependency edge just because two open issues' context maps
(`context_map.py`) overlap on the same files — that is a *candidate* signal worth
surfacing to a human ("Issue #40 and #52 both touch `src/lib/supabase.ts` — might
be related, want me to link them?"), not something to silently treat as a hard
blocking dependency. False positives here freeze real work for no reason.

## The freeze/unfreeze state machine

Each edge has `status: "active" | "frozen"`. `dependency_graph.py check` is the only
thing that flips it, and only on an actual transition:

- **active → frozen**: upstream issue `M` is judged "delayed" (see below) AND the
  edge is currently active.
  - Adds `freeze_label` (config, default `blocked-by-dependency`) to issue `N`.
  - Posts one comment on `N` naming `M`, its assignees, and the reason.
  - Records `frozen_reason` and `frozen_at` in state.
- **frozen → active**: upstream `M` is no longer judged delayed AND the edge is
  currently frozen.
  - Removes `freeze_label` from `N`.
  - Posts one "unblocked" comment.
  - Clears `frozen_reason`/`frozen_at`.
- **No transition** (delayed-and-already-frozen, or active-and-still-fine): zero
  GitHub API writes. This is what makes repeated scheduled runs safe — running
  `check` every 2 hours does not produce a new comment every 2 hours, only at the
  moment something actually changes.

## "Delayed" heuristic

An upstream issue counts as delayed if, at check time:
- it's still open, AND
- it carries a label in `config.delayed_labels` (default: `delayed`, `retrasado`,
  `blocked`, `stale`), **or**
- `updated_at` is older than `config.stale_days` (default 10) ago.

This is intentionally simple (label OR staleness) rather than trying to parse
estimates/due dates, because most teams don't reliably fill those in. If a team
uses GitHub Projects v2 with a real "target date" field, that's a stronger signal
worth wiring in later via the Projects v2 GraphQL API — flag this as a possible
upgrade rather than building it speculatively.

## Multiple downstream issues, one delayed upstream

`check` iterates edges independently, so if issues 34, 40, and 52 all declare a
dependency on the same delayed issue 12, all three freeze with their own comment.
This is deliberate — each assignee needs their own notification, not just one for
the group.

## Recovering from a bad freeze

If `check` froze something it shouldn't have (heuristic false positive), the fastest
fix is **not** to hand-edit `dependency_state.json` — either:
- Remove the label and edge manually via `gh_api.py issue-label-remove` +
  `dependency_graph.py` state edit, or
- Add the exception to `config.json` (e.g. exclude that label from
  `delayed_labels`, or bump `stale_days`) so it doesn't recur, then let the next
  `check` run un-freeze it naturally.
