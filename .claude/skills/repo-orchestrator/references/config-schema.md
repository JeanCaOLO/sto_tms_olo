# Per-project config and state files

All of these live inside the **target repo**, not inside this skill's own directory
(the skill is installed once globally; each repo it's pointed at gets its own state,
the same way `graphify-out/` is per-repo). Default location: `.claude/orchestrator/`
relative to the repo root.

```
<repo>/.claude/orchestrator/
  config.json             # tunables, see below
  roster.json             # email -> {name, github_login, source}
  dependency_state.json   # tracked issue dependency edges + freeze state
```

Add `.claude/orchestrator/roster.json` and `dependency_state.json` to the repo's
`.gitignore` unless the team explicitly wants them shared/versioned — `config.json`
is usually fine to commit (it's team policy, not personal data), but ask before
assuming either way if the repo doesn't already ignore `.claude/`.

## config.json

```json
{
  "repo": "owner/name",
  "lookback_days": 180,
  "half_life_days": 45,
  "workload_saturation_threshold": 3.0,
  "workload_label_weights": {
    "priority:critical": 3.0,
    "priority:high": 2.0,
    "priority:medium": 1.0,
    "priority:low": 0.5,
    "size:xl": 2.0,
    "size:l": 1.5
  },
  "delayed_labels": ["delayed", "retrasado", "blocked", "stale"],
  "stale_days": 10,
  "freeze_label": "blocked-by-dependency",
  "doc_globs": ["docs/**/*.md", "README*.md", "**/*.sql", "supabase/**/*", "**/*.graphql"]
}
```

Field notes:
- `lookback_days` / `half_life_days` — feed `skill_profile.py`. Half-life controls
  how fast old contributions decay; 45 days means a commit from 45 days ago counts
  half as much as one made today.
- `workload_saturation_threshold` — a person is "saturated" once their weighted
  open-issue score exceeds this. Tune per team size/velocity.
- `delayed_labels` / `stale_days` — how `dependency_graph.py check` decides an
  upstream issue is "delayed": either it carries one of these labels, or it's been
  open with no update for longer than `stale_days`.
- `freeze_label` — the label applied to a downstream issue while it's frozen.
  Create this label in the repo once (`gh_api.py` has no `label create` — use the
  GitHub UI or `POST /repos/{repo}/labels` directly) before running `check` for the
  first time, otherwise the label-add call 404s (allow_fail swallows it silently —
  worth telling the user explicitly if it happens).

## roster.json

```json
{
  "jalvarez@example.com": {"name": "Jean Carlo Alvarez", "github_login": "JeanCaOLO", "source": "api"},
  "someone@corp.internal": {"name": "Someone Corp", "github_login": null, "source": "unresolved"},
  "github:newhire99": {"name": "newhire99", "github_login": "newhire99", "source": "collaborator"}
}
```

Two different key shapes coexist, because there are two different ways a person
enters the roster:

- **Keyed by commit email** (`jalvarez@example.com`) — added by `roster.py build`,
  which reads `git log`. Only picks up people who have already committed.
  `source: "unresolved"` means GitHub couldn't link that commit email to an
  account (common for corporate email addresses that aren't on the linked-emails
  list of a GitHub profile). Ask the human doing this once per unresolved email:
  "what's the GitHub username for {name} ({email})?" and hand-edit the entry — set
  `github_login` and `source: "manual"`. `roster.py build` never overwrites an
  entry whose `source` is not `"unresolved"`, so manual fixes are permanent until
  the user deletes the entry.
- **Keyed by `github:<login>`** — added by `roster.py seed-collaborators`, which
  reads `/repos/{repo}/collaborators` instead of git history. This is what makes
  a teammate visible to `workload.py` (assignable, has open issues) even before
  their first commit. `skill_profile.py` still won't rank them for any module
  until they actually have git history in it — that's correct, not a bug: a
  workload-aware assignment can still steer easy/onboarding issues to them, it's
  the module-ownership ranking specifically that has nothing to go on yet.

Run both `build` and `seed-collaborators` together (see SKILL.md's `roster
refresh`) whenever the team changes size — neither one alone gives the full
picture.

## dependency_state.json

Written and read exclusively by `dependency_graph.py` — see
`references/dependency-rules.md` for the full state machine. Don't hand-edit unless
recovering from a mistake; use `link`/`discover`/`check` subcommands instead.
