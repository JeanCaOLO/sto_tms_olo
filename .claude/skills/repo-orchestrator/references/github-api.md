# GitHub API access

`repo-orchestrator` talks to GitHub over the plain REST API using `scripts/gh_api.py`
(stdlib `urllib`, no `gh` CLI, no third-party packages). It reads a token from the
**process environment**, checked in this order: `GITHUB_TOKEN`, then `GH_TOKEN`.

## Setting up the token

The token needs `repo` scope (classic PAT) or, for a fine-grained PAT, at least:
`Issues: read/write`, `Contents: read`, `Metadata: read`, `Pull requests: read`.

- PowerShell (persists for the session): `$env:GITHUB_TOKEN = "ghp_..."`
- Bash: `export GITHUB_TOKEN="ghp_..."`

**Environment quirk observed on this machine (git-bash under Windows):** a shell
variable can be visible to `[ -n "$GITHUB_TOKEN" ]` checks and to commands built via
string interpolation (`curl -H "Authorization: Bearer $GITHUB_TOKEN"`) while still
being *invisible* to child processes that read `os.environ` (like `gh_api.py`),
because the variable was never actually `export`-ed into the process environment
table. If `gh_api.py rate-limit` reports "No GITHUB_TOKEN or GH_TOKEN found" right
after a shell check said it was set, this is why — re-export it explicitly in the
*same* shell invocation that runs the Python script:
```bash
export GITHUB_TOKEN="$GITHUB_TOKEN"
python scripts/gh_api.py rate-limit
```
In PowerShell this quirk does not occur — `$env:GITHUB_TOKEN` is always inherited by
child processes.

## Preflight check (always run this before anything else)

```bash
python scripts/gh_api.py rate-limit
```

- If it returns `{"error": "No GITHUB_TOKEN or GH_TOKEN found..."}` → the token isn't
  exported in this shell. Ask the user to export a valid one; do not proceed.
- If it returns `{"error": "...401 Bad credentials..."}` → the token exists but is
  invalid/expired/revoked. Tell the user exactly this (don't guess further) and stop.
- Otherwise it returns the rate-limit JSON — proceed.

## Commands available

See the argparse subcommands in `scripts/gh_api.py` directly (it's the source of
truth): `repo-info`, `issues-list`, `issue-get`, `issue-comment`, `issue-label-add`,
`issue-label-remove`, `issue-assign`, `issue-timeline`, `commit-get`, `compare`,
`branches-list`, `search-issues`, `rate-limit`.

All output is JSON on stdout. Errors are `{"error": "..."}` on stdout with exit
code 1 — check for the `error` key, don't rely on parsing stderr.

## Rate limits

Authenticated REST calls get 5,000 req/hour. `workload.py` and `dependency_graph.py
check` make one call per roster member / per tracked edge — fine at team scale
(tens of people, tens of tracked dependencies), but if a repo has hundreds of open
issues tracked as dependencies, batch `check` runs less frequently (the `schedule`
skill's interval) rather than tightening a retry loop.
