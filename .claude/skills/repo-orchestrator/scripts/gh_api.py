#!/usr/bin/env python3
"""Thin GitHub REST API client, stdlib-only (urllib). No gh CLI, no third-party deps.

Auth: reads GITHUB_TOKEN or GH_TOKEN from the environment. Never accepts a token
as a CLI argument (would leak into shell history / process listing).

Usage:
  gh_api.py repo-info --repo owner/name
  gh_api.py issues list --repo owner/name [--state open|closed|all] [--label X] [--assignee X]
  gh_api.py issue get --repo owner/name --number N
  gh_api.py issue comment --repo owner/name --number N --body-file path.md
  gh_api.py issue label-add --repo owner/name --number N --label X
  gh_api.py issue label-remove --repo owner/name --number N --label X
  gh_api.py issue assign --repo owner/name --number N --login USER
  gh_api.py issue timeline --repo owner/name --number N
  gh_api.py commit get --repo owner/name --sha SHA
  gh_api.py compare --repo owner/name --base BASE --head HEAD
  gh_api.py branches list --repo owner/name
  gh_api.py search issues --repo owner/name --query "is:open assignee:foo"
  gh_api.py rate-limit

All output is JSON on stdout. On error, prints {"error": ...} to stdout and exits 1.
"""
import json
import os
import sys
import urllib.request
import urllib.parse
import urllib.error
import argparse

# Windows consoles often default sys.stdout to cp1252, which can't encode
# arbitrary GitHub content (names, issue bodies) and raises UnicodeEncodeError.
try:
    sys.stdout.reconfigure(encoding="utf-8")
except (AttributeError, ValueError):
    pass

API = "https://api.github.com"


def _token():
    return os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")


def _request(method, path, params=None, body=None):
    token = _token()
    if not token:
        _fail("No GITHUB_TOKEN or GH_TOKEN found in environment. "
              "See references/github-api.md for how to set one up.")
    url = API + path
    if params:
        url += "?" + urllib.parse.urlencode({k: v for k, v in params.items() if v is not None})
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("X-GitHub-Api-Version", "2022-11-28")
    if data is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            remaining = resp.headers.get("X-RateLimit-Remaining")
            out = json.loads(resp.read().decode("utf-8") or "null")
            return out, remaining
    except urllib.error.HTTPError as e:
        payload = e.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(payload)
        except json.JSONDecodeError:
            parsed = {"raw": payload}
        if e.code == 401:
            _fail("GitHub API returned 401 Bad credentials. The GITHUB_TOKEN/GH_TOKEN "
                  "in this environment is invalid or expired. See references/github-api.md.")
        if e.code == 403 and "rate limit" in payload.lower():
            _fail("GitHub API rate limit exceeded. Wait and retry, or check rate-limit subcommand.")
        _fail(f"GitHub API error {e.code} on {method} {path}: {parsed}")
    except urllib.error.URLError as e:
        _fail(f"Network error reaching GitHub API: {e}")


def _fail(msg):
    print(json.dumps({"error": msg}))
    sys.exit(1)


def _ok(obj):
    print(json.dumps(obj, ensure_ascii=False))


def cmd_repo_info(a):
    data, _ = _request("GET", f"/repos/{a.repo}")
    _ok(data)


def cmd_issues_list(a):
    params = {"state": a.state or "open", "per_page": 100}
    if a.label:
        params["labels"] = a.label
    if a.assignee:
        params["assignee"] = a.assignee
    data, _ = _request("GET", f"/repos/{a.repo}/issues", params=params)
    # GitHub's issues endpoint also returns PRs; filter those out unless requested.
    if not a.include_prs:
        data = [i for i in data if "pull_request" not in i]
    _ok(data)


def cmd_issue_get(a):
    data, _ = _request("GET", f"/repos/{a.repo}/issues/{a.number}")
    _ok(data)


def cmd_issue_comment(a):
    body = open(a.body_file, "r", encoding="utf-8").read()
    data, _ = _request("POST", f"/repos/{a.repo}/issues/{a.number}/comments", body={"body": body})
    _ok(data)


def cmd_issue_label_add(a):
    data, _ = _request("POST", f"/repos/{a.repo}/issues/{a.number}/labels", body={"labels": [a.label]})
    _ok(data)


def cmd_issue_label_remove(a):
    try:
        data, _ = _request("DELETE", f"/repos/{a.repo}/issues/{a.number}/labels/{urllib.parse.quote(a.label)}")
    except SystemExit:
        raise
    _ok({"removed": a.label})


def cmd_issue_assign(a):
    data, _ = _request("POST", f"/repos/{a.repo}/issues/{a.number}/assignees", body={"assignees": [a.login]})
    _ok(data)


def cmd_issue_timeline(a):
    data, _ = _request("GET", f"/repos/{a.repo}/issues/{a.number}/timeline", params={"per_page": 100})
    _ok(data)


def cmd_commit_get(a):
    data, _ = _request("GET", f"/repos/{a.repo}/commits/{a.sha}")
    _ok(data)


def cmd_compare(a):
    data, _ = _request("GET", f"/repos/{a.repo}/compare/{a.base}...{a.head}")
    _ok(data)


def cmd_branches_list(a):
    data, _ = _request("GET", f"/repos/{a.repo}/branches", params={"per_page": 100})
    _ok(data)


def cmd_collaborators_list(a):
    # Requires push access to the repo to call (GitHub restricts this endpoint to
    # people who can already see the collaborator list). Returns everyone with
    # access regardless of whether they've ever committed - the point of this
    # subcommand is precisely to see people BEFORE their first commit.
    data, _ = _request("GET", f"/repos/{a.repo}/collaborators", params={"per_page": 100})
    _ok(data)


def cmd_search_issues(a):
    q = f"repo:{a.repo} {a.query}"
    data, _ = _request("GET", "/search/issues", params={"q": q, "per_page": 100})
    _ok(data)


def cmd_rate_limit(a):
    data, _ = _request("GET", "/rate_limit")
    _ok(data)


def main():
    p = argparse.ArgumentParser(prog="gh_api.py")
    sub = p.add_subparsers(dest="cmd", required=True)

    def add(name, fn, needs_repo=True, extra=None):
        sp = sub.add_parser(name)
        if needs_repo:
            sp.add_argument("--repo", required=True, help="owner/name")
        if extra:
            extra(sp)
        sp.set_defaults(fn=fn)

    add("repo-info", cmd_repo_info)
    add("rate-limit", cmd_rate_limit, needs_repo=False)

    add("issues-list", cmd_issues_list, extra=lambda sp: (
        sp.add_argument("--state", default="open"),
        sp.add_argument("--label"),
        sp.add_argument("--assignee"),
        sp.add_argument("--include-prs", action="store_true"),
    ))
    add("issue-get", cmd_issue_get, extra=lambda sp: sp.add_argument("--number", required=True))
    add("issue-comment", cmd_issue_comment, extra=lambda sp: (
        sp.add_argument("--number", required=True),
        sp.add_argument("--body-file", required=True),
    ))
    add("issue-label-add", cmd_issue_label_add, extra=lambda sp: (
        sp.add_argument("--number", required=True),
        sp.add_argument("--label", required=True),
    ))
    add("issue-label-remove", cmd_issue_label_remove, extra=lambda sp: (
        sp.add_argument("--number", required=True),
        sp.add_argument("--label", required=True),
    ))
    add("issue-assign", cmd_issue_assign, extra=lambda sp: (
        sp.add_argument("--number", required=True),
        sp.add_argument("--login", required=True),
    ))
    add("issue-timeline", cmd_issue_timeline, extra=lambda sp: sp.add_argument("--number", required=True))
    add("commit-get", cmd_commit_get, extra=lambda sp: sp.add_argument("--sha", required=True))
    add("compare", cmd_compare, extra=lambda sp: (
        sp.add_argument("--base", required=True),
        sp.add_argument("--head", required=True),
    ))
    add("branches-list", cmd_branches_list)
    add("collaborators-list", cmd_collaborators_list)
    add("search-issues", cmd_search_issues, extra=lambda sp: sp.add_argument("--query", required=True))

    args = p.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
