#!/usr/bin/env python3
"""Skill profiling: who has touched which module/community recently, and how much.

Reads git log --numstat directly (no GitHub API needed) and maps changed files to
graphify communities via graphify-out/graph.json + .graphify_labels.json.

Score per (author_email, community) = sum over commits of:
    lines_changed * exp(-age_days / HALF_LIFE_DAYS)

Recency-weighted so a dev who owned a module 8 months ago but hasn't touched it
since is correctly out-ranked by someone actively working in it now.

Usage:
  skill_profile.py build --git-root PATH --graph-root PATH [--lookback-days 180] [--half-life-days 45]
    -> prints {"scores": {email: {community_label: score, ...}}, "names": {email: display_name}}

  skill_profile.py top-for-module --git-root PATH --graph-root PATH --module "Route Planning Config" [--n 3]
    -> prints ranked [{"email":..., "name":..., "score":...}, ...]

  skill_profile.py top-for-files --git-root PATH --files "a.tsx,b.tsx" [--lookback-days 180] [--half-life-days 45]
    -> ranks authors by recency-weighted lines changed on this exact file list (no graph needed)
"""
import argparse
import json
import math
import subprocess
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")
except (AttributeError, ValueError):
    pass


def _fail(msg):
    print(json.dumps({"error": msg}))
    sys.exit(1)


def load_graph(graph_root):
    graph_path = Path(graph_root) / "graphify-out" / "graph.json"
    labels_path = Path(graph_root) / "graphify-out" / ".graphify_labels.json"
    if not graph_path.exists():
        return None, None
    graph = json.loads(graph_path.read_text(encoding="utf-8"))
    labels = {}
    if labels_path.exists():
        labels = json.loads(labels_path.read_text(encoding="utf-8"))
    file_to_community = {}
    for n in graph.get("nodes", []):
        sf = n.get("source_file")
        c = n.get("community")
        if sf is not None and c is not None:
            file_to_community.setdefault(sf, c)
    return file_to_community, labels


def community_label(cid, labels):
    return labels.get(str(cid), f"Community {cid}")


def git_numstat_log(git_root, lookback_days):
    args = [
        "git", "-C", str(git_root), "log",
        f"--since={lookback_days}.days",
        "--numstat",
        "--no-merges",
        "--format=COMMIT|%H|%ae|%an|%aI",
    ]
    try:
        out = subprocess.run(args, capture_output=True, text=True, check=True, encoding="utf-8")
    except subprocess.CalledProcessError as e:
        _fail(f"git log failed: {e.stderr}")
    except FileNotFoundError:
        _fail("git not found on PATH")
    return out.stdout


def parse_numstat(raw):
    """Yields (email, name, commit_date_iso, [(added, removed, path), ...])."""
    commits = []
    cur = None
    for line in raw.splitlines():
        if line.startswith("COMMIT|"):
            if cur:
                commits.append(cur)
            _, sha, email, name, date = line.split("|", 4)
            cur = {"sha": sha, "email": email, "name": name, "date": date, "files": []}
        elif line.strip() and cur is not None:
            parts = line.split("\t")
            if len(parts) == 3:
                added, removed, path = parts
                added = 0 if added == "-" else int(added)
                removed = 0 if removed == "-" else int(removed)
                cur["files"].append((added, removed, path))
    if cur:
        commits.append(cur)
    return commits


def recency_weight(commit_date_iso, half_life_days):
    try:
        d = datetime.fromisoformat(commit_date_iso)
    except ValueError:
        return 0.0
    if d.tzinfo is None:
        d = d.replace(tzinfo=timezone.utc)
    age_days = (datetime.now(timezone.utc) - d).total_seconds() / 86400.0
    return math.exp(-age_days / half_life_days)


def cmd_build(a):
    file_to_community, labels = load_graph(a.graph_root)
    raw = git_numstat_log(a.git_root, a.lookback_days)
    commits = parse_numstat(raw)

    scores = defaultdict(lambda: defaultdict(float))
    names = {}
    unmapped_lines = defaultdict(float)

    for c in commits:
        names[c["email"]] = c["name"]
        w = recency_weight(c["date"], a.half_life_days)
        for added, removed, path in c["files"]:
            lines = added + removed
            if file_to_community is not None and path in file_to_community:
                label = community_label(file_to_community[path], labels)
                scores[c["email"]][label] += lines * w
            else:
                unmapped_lines[c["email"]] += lines * w

    result = {
        "scores": {e: dict(m) for e, m in scores.items()},
        "names": names,
        "unmapped_score": dict(unmapped_lines),
        "graph_available": file_to_community is not None,
        "lookback_days": a.lookback_days,
        "half_life_days": a.half_life_days,
        "commits_analyzed": len(commits),
    }
    print(json.dumps(result, ensure_ascii=False))


def cmd_top_for_module(a):
    file_to_community, labels = load_graph(a.graph_root)
    if file_to_community is None:
        _fail("No graphify-out/graph.json found at graph-root. Run /graphify first.")
    raw = git_numstat_log(a.git_root, a.lookback_days)
    commits = parse_numstat(raw)
    scores = defaultdict(float)
    names = {}
    for c in commits:
        names[c["email"]] = c["name"]
        w = recency_weight(c["date"], a.half_life_days)
        for added, removed, path in c["files"]:
            cid = file_to_community.get(path)
            if cid is None:
                continue
            if community_label(cid, labels) == a.module:
                scores[c["email"]] += (added + removed) * w
    ranked = sorted(
        ({"email": e, "name": names.get(e, e), "score": round(s, 2)} for e, s in scores.items()),
        key=lambda x: -x["score"],
    )[: a.n]
    print(json.dumps(ranked, ensure_ascii=False))


def cmd_top_for_files(a):
    files = set(a.files.split(","))
    raw = git_numstat_log(a.git_root, a.lookback_days)
    commits = parse_numstat(raw)
    scores = defaultdict(float)
    names = {}
    for c in commits:
        names[c["email"]] = c["name"]
        w = recency_weight(c["date"], a.half_life_days)
        for added, removed, path in c["files"]:
            if path in files:
                scores[c["email"]] += (added + removed) * w
    ranked = sorted(
        ({"email": e, "name": names.get(e, e), "score": round(s, 2)} for e, s in scores.items()),
        key=lambda x: -x["score"],
    )
    print(json.dumps(ranked, ensure_ascii=False))


def main():
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="cmd", required=True)

    b = sub.add_parser("build")
    b.add_argument("--git-root", required=True)
    b.add_argument("--graph-root", required=True)
    b.add_argument("--lookback-days", type=int, default=180)
    b.add_argument("--half-life-days", type=int, default=45)
    b.set_defaults(fn=cmd_build)

    t = sub.add_parser("top-for-module")
    t.add_argument("--git-root", required=True)
    t.add_argument("--graph-root", required=True)
    t.add_argument("--module", required=True)
    t.add_argument("--n", type=int, default=3)
    t.add_argument("--lookback-days", type=int, default=180)
    t.add_argument("--half-life-days", type=int, default=45)
    t.set_defaults(fn=cmd_top_for_module)

    tf = sub.add_parser("top-for-files")
    tf.add_argument("--git-root", required=True)
    tf.add_argument("--files", required=True, help="comma-separated relative paths")
    tf.add_argument("--lookback-days", type=int, default=180)
    tf.add_argument("--half-life-days", type=int, default=45)
    tf.set_defaults(fn=cmd_top_for_files)

    args = p.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
