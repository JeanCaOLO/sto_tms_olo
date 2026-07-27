# Skill profiling and workload scoring formulas

## Skill profile (who owns which module)

For each git commit in the lookback window (`config.lookback_days`, default 180),
for each file changed with `added + removed` lines:

```
weight(commit) = exp(-age_days(commit) / half_life_days)
score(author, community) += lines_changed(file) * weight(commit)
```

`community` comes from graphify's clustering (`graph.json` node `community` field,
labeled via `.graphify_labels.json`). A file maps to whichever community its first
matching node belongs to — graphify assigns one community per node, and most files
have a dominant node (the file-level node itself), so this is a reasonable proxy
without needing per-line attribution.

Recency-weighting matters: raw commit counts would let someone who wrote a module
a year ago and never touched it since keep "owning" it forever. The exponential
decay means active recent work always outranks stale historical work, while still
giving credit for foundational contributions that are still relatively recent.

Files with no graph mapping (new files not yet re-graphed, or files outside the
graphed corpus) accumulate into `unmapped_score` per author instead of being
silently dropped — surface this if it's large relative to mapped scores, since it
usually means the graph is stale and `/graphify <path> --update` should be re-run
before trusting the profile.

## Workload score

```
workload(login) = sum over open issues assigned to login of weight(issue)
weight(issue) = sum of config.workload_label_weights matched on issue.labels,
                or 1.0 if no weighted label matched
```

A person is "saturated" when `workload(login) > config.workload_saturation_threshold`.

## Matching algorithm (`assign`)

1. Run skill profile, ranked by score for the issue's inferred module (from
   `context_map.py` on the issue title+body).
2. Walk the ranked list top-down. For each candidate, check workload. Skip
   saturated candidates for critical/high-priority issues (do not skip for
   low-priority ones automatically — saturation is a soft signal there, not a hard
   block; use judgment and say so).
3. Recommend the first non-saturated candidate, but **always show the full ranked
   list with scores and workload** so the human can override — this is a
   recommendation, not a silent auto-assign. Actually calling
   `gh_api.py issue-assign` requires explicit confirmation from whoever invoked
   `/repo-orchestrator assign` (mutating a shared GitHub issue is a "visible to
   others" action).
4. If the top candidate is saturated, explicitly say so and why the next one was
   chosen instead — never silently substitute without explaining the tradeoff.
