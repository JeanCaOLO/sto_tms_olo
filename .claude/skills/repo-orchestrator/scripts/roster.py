#!/usr/bin/env python3
"""Build/maintain the email -> GitHub login roster for a repo.

git log only surfaces people who have already committed - a teammate added to the
project today but who hasn't pushed code yet is invisible to `build` alone. Use
`seed-collaborators` alongside `build` (SKILL.md's `init` runs both) to also pull
in everyone with repo access from GitHub itself, commits or not.

Resolution order per email (`build`):
  1. Already in roster.json with source != "unresolved" -> keep as-is (manual edits win).
  2. Try the GitHub API: look up one commit by that author email via /repos/{repo}/commits
     ?author=<email>, take the associated author.login if GitHub could link it.
  3. Fall back to source="unresolved" - the SKILL must ask the human to fill in
     roster.json by hand for that email (references/config-schema.md documents the format).

`seed-collaborators` adds one entry per GitHub collaborator not already present
under any existing github_login, keyed as "github:<login>" (there is no commit
email to key by yet). Never overwrites an existing entry.

Usage:
  roster.py build --git-root PATH --repo owner/name --roster-path PATH [--lookback-days 365]
  roster.py seed-collaborators --repo owner/name --roster-path PATH
  roster.py show --roster-path PATH
"""
import argparse
import json
import subprocess
import sys
import urllib.request
import urllib.parse
import urllib.error
import os
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")
except (AttributeError, ValueError):
    pass

SCRIPTS_DIR = Path(__file__).resolve().parent
API = "https://api.github.com"


def _fail(msg):
    print(json.dumps({"error": msg}))
    sys.exit(1)


def _token():
    return os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")


def git_authors(git_root, lookback_days):
    args = ["git", "-C", str(git_root), "log", f"--since={lookback_days}.days", "--format=%ae|%an"]
    try:
        out = subprocess.run(args, capture_output=True, text=True, check=True, encoding="utf-8")
    except subprocess.CalledProcessError as e:
        _fail(f"git log failed: {e.stderr}")
    except FileNotFoundError:
        _fail("git not found on PATH")
    seen = {}
    for line in out.stdout.splitlines():
        if "|" in line:
            email, name = line.split("|", 1)
            seen.setdefault(email, name)
    return seen


def resolve_login(repo, email):
    token = _token()
    if not token:
        return None
    try:
        url = f"{API}/repos/{repo}/commits?" + urllib.parse.urlencode({"author": email, "per_page": 1})
        req = urllib.request.Request(url)
        req.add_header("Authorization", f"Bearer {token}")
        req.add_header("Accept", "application/vnd.github+json")
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8") or "[]")
        if data and data[0].get("author"):
            return data[0]["author"].get("login")
    except (urllib.error.HTTPError, urllib.error.URLError, IndexError, KeyError):
        return None
    return None


def load_roster(path):
    p = Path(path)
    if p.exists():
        return json.loads(p.read_text(encoding="utf-8"))
    return {}


def cmd_build(a):
    roster = load_roster(a.roster_path)
    authors = git_authors(a.git_root, a.lookback_days)
    changed = False
    for email, name in authors.items():
        entry = roster.get(email)
        if entry and entry.get("source") != "unresolved":
            continue
        login = resolve_login(a.repo, email)
        roster[email] = {
            "name": name,
            "github_login": login,
            "source": "api" if login else "unresolved",
        }
        changed = True
    Path(a.roster_path).parent.mkdir(parents=True, exist_ok=True)
    Path(a.roster_path).write_text(json.dumps(roster, indent=2, ensure_ascii=False), encoding="utf-8")
    unresolved = [e for e, v in roster.items() if v.get("source") == "unresolved"]
    print(json.dumps({"roster": roster, "changed": changed, "unresolved_emails": unresolved}, ensure_ascii=False))


def list_collaborators(repo):
    cmd = [sys.executable, str(SCRIPTS_DIR / "gh_api.py"), "collaborators-list", "--repo", repo]
    out = subprocess.run(cmd, capture_output=True, text=True)
    try:
        data = json.loads(out.stdout)
    except json.JSONDecodeError:
        _fail(f"gh_api.py returned non-JSON: {out.stdout or out.stderr}")
    if isinstance(data, dict) and "error" in data:
        _fail(data["error"])
    return data


def cmd_seed_collaborators(a):
    roster = load_roster(a.roster_path)
    known_logins = {v["github_login"] for v in roster.values() if v.get("github_login")}
    collaborators = list_collaborators(a.repo)
    added = []
    for c in collaborators:
        login = c.get("login")
        if not login or login in known_logins:
            continue
        key = f"github:{login}"
        if key in roster:
            continue
        roster[key] = {"name": login, "github_login": login, "source": "collaborator"}
        added.append(login)
    Path(a.roster_path).parent.mkdir(parents=True, exist_ok=True)
    Path(a.roster_path).write_text(json.dumps(roster, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps({"roster": roster, "added_logins": added}, ensure_ascii=False))


def cmd_show(a):
    print(json.dumps(load_roster(a.roster_path), ensure_ascii=False))


def main():
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="cmd", required=True)

    b = sub.add_parser("build")
    b.add_argument("--git-root", required=True)
    b.add_argument("--repo", required=True)
    b.add_argument("--roster-path", required=True)
    b.add_argument("--lookback-days", type=int, default=365)
    b.set_defaults(fn=cmd_build)

    sc = sub.add_parser("seed-collaborators")
    sc.add_argument("--repo", required=True)
    sc.add_argument("--roster-path", required=True)
    sc.set_defaults(fn=cmd_seed_collaborators)

    s = sub.add_parser("show")
    s.add_argument("--roster-path", required=True)
    s.set_defaults(fn=cmd_show)

    args = p.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
