#!/usr/bin/env python3
"""Workload balancing: compute a weighted "how busy is this person" score per
roster member from their currently-open, assigned GitHub issues.

Score = sum over their open assigned issues of label_weight(issue.labels),
default weight 1.0 per issue, boosted by priority/size labels per config.

Usage:
  workload.py compute --repo owner/name --roster-path PATH --config-path PATH
    -> {"workload": {login: {"score": N, "issues": [numbers]}}, "saturated": [logins]}
"""
import argparse
import json
import subprocess
import sys
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")
except (AttributeError, ValueError):
    pass

SCRIPTS_DIR = Path(__file__).resolve().parent

DEFAULT_WEIGHTS = {
    "priority:critical": 3.0,
    "priority:high": 2.0,
    "priority:medium": 1.0,
    "priority:low": 0.5,
    "size:xl": 2.0,
    "size:l": 1.5,
}
DEFAULT_THRESHOLD = 3.0


def _fail(msg):
    print(json.dumps({"error": msg}))
    sys.exit(1)


def gh(repo, *args):
    cmd = [sys.executable, str(SCRIPTS_DIR / "gh_api.py"), *args, "--repo", repo]
    out = subprocess.run(cmd, capture_output=True, text=True)
    try:
        data = json.loads(out.stdout)
    except json.JSONDecodeError:
        _fail(f"gh_api.py returned non-JSON: {out.stdout or out.stderr}")
    if isinstance(data, dict) and "error" in data:
        _fail(data["error"])
    return data


def load_json(path, default):
    p = Path(path)
    if p.exists():
        return json.loads(p.read_text(encoding="utf-8"))
    return default


def issue_weight(issue, weights):
    labels = {l["name"].lower() for l in issue.get("labels", [])}
    w = 0.0
    matched = False
    for label_name, weight in weights.items():
        if label_name.lower() in labels:
            w += weight
            matched = True
    return w if matched else 1.0


def cmd_compute(a):
    roster = load_json(a.roster_path, {})
    config = load_json(a.config_path, {})
    weights = {**DEFAULT_WEIGHTS, **config.get("workload_label_weights", {})}
    threshold = config.get("workload_saturation_threshold", DEFAULT_THRESHOLD)

    logins = sorted({v["github_login"] for v in roster.values() if v.get("github_login")})
    if not logins:
        _fail("No resolved GitHub logins in roster. Run roster.py build first, "
              "or fill github_login manually in roster.json.")

    workload = {}
    for login in logins:
        issues = gh(a.repo, "search-issues", "--query", f"is:open is:issue assignee:{login}")
        items = issues.get("items", [])
        score = sum(issue_weight(i, weights) for i in items)
        workload[login] = {
            "score": round(score, 2),
            "issues": [i["number"] for i in items],
        }

    saturated = [login for login, w in workload.items() if w["score"] > threshold]
    print(json.dumps({
        "workload": workload,
        "saturated": saturated,
        "threshold": threshold,
    }, ensure_ascii=False))


def main():
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("compute")
    c.add_argument("--repo", required=True)
    c.add_argument("--roster-path", required=True)
    c.add_argument("--config-path", required=True)
    c.set_defaults(fn=cmd_compute)
    args = p.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
