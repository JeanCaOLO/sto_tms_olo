#!/usr/bin/env python3
"""Dependency graph maintenance: link issues, discover declared dependencies from
issue bodies, and freeze/unfreeze downstream issues when an upstream dependency is
delayed. This is the script the scheduled watcher calls (capability #1).

State lives in dependency_state.json (one file per repo, see references/config-schema.md):
  {
    "edges": [
      {"issue": 34, "depends_on": 12, "reason": "orders DB migration", "source": "manual"|"discovered",
       "status": "active"|"frozen", "frozen_reason": null, "frozen_at": null}
    ]
  }

Idempotency: check only mutates GitHub (labels/comments) on an actual active<->frozen
transition. Re-running check with no state change produces zero API writes.

Usage:
  dependency_graph.py link --state-path P --issue N --depends-on M [--reason TEXT]
  dependency_graph.py discover --repo owner/name --state-path P
  dependency_graph.py check --repo owner/name --state-path P --config-path C [--dry-run]
"""
import argparse
import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")
except (AttributeError, ValueError):
    pass

SCRIPTS_DIR = Path(__file__).resolve().parent

DEP_PATTERNS = [
    re.compile(r"(?:depends?\s+on|blocked\s+by)\s*:?\s*#(\d+)", re.IGNORECASE),
    re.compile(r"(?:depende\s+de|bloqueado\s+por)\s*:?\s*#(\d+)", re.IGNORECASE),
]

DEFAULT_DELAYED_LABELS = {"delayed", "retrasado", "blocked", "stale"}
DEFAULT_STALE_DAYS = 10
DEFAULT_FREEZE_LABEL = "blocked-by-dependency"


def _fail(msg):
    print(json.dumps({"error": msg}))
    sys.exit(1)


def gh(repo, *args, allow_fail=False):
    cmd = [sys.executable, str(SCRIPTS_DIR / "gh_api.py"), *args, "--repo", repo]
    out = subprocess.run(cmd, capture_output=True, text=True)
    try:
        data = json.loads(out.stdout)
    except json.JSONDecodeError:
        if allow_fail:
            return None
        _fail(f"gh_api.py returned non-JSON: {out.stdout or out.stderr}")
    if isinstance(data, dict) and "error" in data:
        if allow_fail:
            return None
        _fail(data["error"])
    return data


def load_state(path):
    p = Path(path)
    if p.exists():
        return json.loads(p.read_text(encoding="utf-8"))
    return {"edges": []}


def save_state(path, state):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(json.dumps(state, indent=2, ensure_ascii=False), encoding="utf-8")


def find_edge(state, issue, depends_on):
    for e in state["edges"]:
        if e["issue"] == issue and e["depends_on"] == depends_on:
            return e
    return None


def cmd_link(a):
    state = load_state(a.state_path)
    e = find_edge(state, a.issue, a.depends_on)
    if e:
        e["reason"] = a.reason or e.get("reason")
        e["source"] = "manual"
    else:
        state["edges"].append({
            "issue": a.issue, "depends_on": a.depends_on, "reason": a.reason,
            "source": "manual", "status": "active", "frozen_reason": None, "frozen_at": None,
        })
    save_state(a.state_path, state)
    print(json.dumps({"ok": True, "edges": state["edges"]}, ensure_ascii=False))


def cmd_discover(a):
    state = load_state(a.state_path)
    issues = gh(a.repo, "issues-list", "--state", "open")
    added = []
    for issue in issues:
        body = issue.get("body") or ""
        for pattern in DEP_PATTERNS:
            for m in pattern.finditer(body):
                dep_on = int(m.group(1))
                if dep_on == issue["number"]:
                    continue
                if not find_edge(state, issue["number"], dep_on):
                    state["edges"].append({
                        "issue": issue["number"], "depends_on": dep_on, "reason": None,
                        "source": "discovered", "status": "active",
                        "frozen_reason": None, "frozen_at": None,
                    })
                    added.append({"issue": issue["number"], "depends_on": dep_on})
    save_state(a.state_path, state)
    print(json.dumps({"added": added, "total_edges": len(state["edges"])}, ensure_ascii=False))


def is_delayed(upstream_issue, config):
    if upstream_issue.get("state") != "open":
        return False, None
    delayed_labels = set(config.get("delayed_labels", list(DEFAULT_DELAYED_LABELS)))
    labels = {l["name"].lower() for l in upstream_issue.get("labels", [])}
    hit = labels & {l.lower() for l in delayed_labels}
    if hit:
        return True, f"tiene la etiqueta '{sorted(hit)[0]}'"
    stale_days = config.get("stale_days", DEFAULT_STALE_DAYS)
    updated = upstream_issue.get("updated_at")
    if updated:
        try:
            d = datetime.fromisoformat(updated.replace("Z", "+00:00"))
            age_days = (datetime.now(timezone.utc) - d).total_seconds() / 86400.0
            if age_days > stale_days:
                return True, f"sin actividad hace {int(age_days)} dias (umbral: {stale_days})"
        except ValueError:
            pass
    return False, None


def cmd_check(a):
    state = load_state(a.state_path)
    config = json.loads(Path(a.config_path).read_text(encoding="utf-8")) if Path(a.config_path).exists() else {}
    freeze_label = config.get("freeze_label", DEFAULT_FREEZE_LABEL)

    transitions = []
    for e in state["edges"]:
        upstream = gh(a.repo, "issue-get", "--number", str(e["depends_on"]), allow_fail=True)
        if upstream is None:
            continue
        delayed, reason = is_delayed(upstream, config)

        if delayed and e["status"] == "active":
            downstream = gh(a.repo, "issue-get", "--number", str(e["issue"]), allow_fail=True)
            assignees = ", ".join(f"@{u['login']}" for u in upstream.get("assignees", [])) or "sin asignar"
            comment = (
                f"Este issue queda congelado: depende de #{e['depends_on']} "
                f"(asignado a {assignees}), que {reason}.\n\n"
                f"Se descongelara automaticamente cuando #{e['depends_on']} deje de estar retrasado."
            )
            if not a.dry_run:
                gh(a.repo, "issue-label-add", "--number", str(e["issue"]), "--label", freeze_label, allow_fail=True)
                body_file = Path(a.state_path).parent / f".comment_{e['issue']}_{e['depends_on']}.md"
                body_file.write_text(comment, encoding="utf-8")
                gh(a.repo, "issue-comment", "--number", str(e["issue"]), "--body-file", str(body_file), allow_fail=True)
                body_file.unlink(missing_ok=True)
            e["status"] = "frozen"
            e["frozen_reason"] = reason
            e["frozen_at"] = datetime.now(timezone.utc).isoformat()
            transitions.append({"issue": e["issue"], "depends_on": e["depends_on"], "new_status": "frozen", "reason": reason})

        elif not delayed and e["status"] == "frozen":
            if not a.dry_run:
                gh(a.repo, "issue-label-remove", "--number", str(e["issue"]), "--label", freeze_label, allow_fail=True)
                body_file = Path(a.state_path).parent / f".comment_{e['issue']}_{e['depends_on']}.md"
                body_file.write_text(
                    f"Desbloqueado: #{e['depends_on']} ya no esta retrasado.", encoding="utf-8")
                gh(a.repo, "issue-comment", "--number", str(e["issue"]), "--body-file", str(body_file), allow_fail=True)
                body_file.unlink(missing_ok=True)
            e["status"] = "active"
            e["frozen_reason"] = None
            e["frozen_at"] = None
            transitions.append({"issue": e["issue"], "depends_on": e["depends_on"], "new_status": "active"})

    if not a.dry_run:
        save_state(a.state_path, state)
    print(json.dumps({"transitions": transitions, "edges_checked": len(state["edges"]), "dry_run": a.dry_run}, ensure_ascii=False))


def main():
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="cmd", required=True)

    l = sub.add_parser("link")
    l.add_argument("--state-path", required=True)
    l.add_argument("--issue", type=int, required=True)
    l.add_argument("--depends-on", type=int, required=True)
    l.add_argument("--reason")
    l.set_defaults(fn=cmd_link)

    d = sub.add_parser("discover")
    d.add_argument("--repo", required=True)
    d.add_argument("--state-path", required=True)
    d.set_defaults(fn=cmd_discover)

    c = sub.add_parser("check")
    c.add_argument("--repo", required=True)
    c.add_argument("--state-path", required=True)
    c.add_argument("--config-path", required=True)
    c.add_argument("--dry-run", action="store_true")
    c.set_defaults(fn=cmd_check)

    args = p.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
