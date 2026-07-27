#!/usr/bin/env python3
"""Generate an onboarding "briefing" for an issue: which existing functions/files to
touch, which internal docs are relevant, and which other branches already touch the
same files (potential merge conflicts).

Usage:
  briefing.py generate --repo owner/name --number N --git-root PATH --graph-root PATH
      [--doc-globs "docs/**/*.md,**/*.sql"] [--post]

  Without --post, prints {"markdown": "...", "issue": N} to stdout for review.
  With --post, also posts the markdown as a GitHub comment on the issue.
"""
import argparse
import fnmatch
import json
import subprocess
import sys
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")
except (AttributeError, ValueError):
    pass

SCRIPTS_DIR = Path(__file__).resolve().parent
DEFAULT_DOC_GLOBS = ["docs/**/*.md", "README*.md", "**/*.sql", "supabase/**/*", "**/*.graphql"]


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


def run_context_map(graph_root, text, grep_root, top=12):
    cmd = [sys.executable, str(SCRIPTS_DIR / "context_map.py"),
           "--graph-root", str(graph_root), "--text", text, "--grep-root", str(grep_root), "--top", str(top)]
    out = subprocess.run(cmd, capture_output=True, text=True)
    try:
        return json.loads(out.stdout)
    except json.JSONDecodeError:
        return {"nodes": [], "communities": [], "grep_hits": []}


def find_doc_hits(git_root, tokens, doc_globs):
    hits = []
    root = Path(git_root)
    for pattern in doc_globs:
        for path in root.glob(pattern):
            if not path.is_file():
                continue
            try:
                content = path.read_text(encoding="utf-8", errors="ignore").lower()
            except OSError:
                continue
            if any(t in content for t in tokens):
                hits.append(str(path.relative_to(root)))
    return sorted(set(hits))[:15]


def changed_files(git_root, base, head):
    try:
        out = subprocess.run(
            ["git", "-C", str(git_root), "diff", "--name-only", f"{base}...{head}"],
            capture_output=True, text=True, timeout=15,
        )
        if out.returncode == 0:
            return [l for l in out.stdout.splitlines() if l.strip()]
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass
    return []


def find_conflicting_branches(git_root, repo, default_branch, related_files):
    subprocess.run(["git", "-C", str(git_root), "fetch", "--all", "--quiet"], capture_output=True, text=True, timeout=30)
    out = subprocess.run(["git", "-C", str(git_root), "branch", "-r", "--format=%(refname:short)"],
                          capture_output=True, text=True, timeout=15)
    conflicts = []
    related_set = set(related_files)
    for line in out.stdout.splitlines():
        branch = line.strip()
        if not branch or branch.endswith(f"/{default_branch}") or "HEAD" in branch:
            continue
        remote, _, name = branch.partition("/")
        changed = changed_files(git_root, f"origin/{default_branch}", branch)
        overlap = related_set & set(changed)
        if overlap:
            conflicts.append({"branch": name, "overlapping_files": sorted(overlap)})
    return conflicts


def cmd_generate(a):
    issue = gh(a.repo, "issue-get", "--number", str(a.number))
    text = f"{issue.get('title','')} {issue.get('body') or ''}"

    ctx = run_context_map(a.graph_root, text, a.git_root)
    related_files = sorted({n["source_file"] for n in ctx.get("nodes", []) if n.get("source_file")})

    doc_globs = a.doc_globs.split(",") if a.doc_globs else DEFAULT_DOC_GLOBS
    doc_hits = find_doc_hits(a.git_root, ctx.get("tokens_used", []), doc_globs)

    repo_info = gh(a.repo, "repo-info", allow_fail=True) or {}
    default_branch = repo_info.get("default_branch", "main")
    conflicts = find_conflicting_branches(a.git_root, a.repo, default_branch, related_files)

    lines = [f"### Briefing automatico para #{a.number}", ""]
    lines.append("**Archivos/funciones existentes relacionados:**")
    if related_files:
        for n in ctx.get("nodes", [])[:10]:
            loc = f"#{n['source_location']}" if n.get("source_location") else ""
            lines.append(f"- `{n['source_file']}{loc}` — `{n['label']}`")
    else:
        lines.append("- No se encontraron coincidencias directas en el grafo (posible funcionalidad nueva).")
    lines.append("")

    lines.append("**Modulos/comunidades involucrados:**")
    for c in ctx.get("communities", [])[:5]:
        lines.append(f"- {c['label']}")
    lines.append("")

    if doc_hits:
        lines.append("**Documentacion interna relevante:**")
        for d in doc_hits:
            lines.append(f"- `{d}`")
        lines.append("")

    if conflicts:
        lines.append("**Posibles conflictos con otras ramas:**")
        for c in conflicts:
            files = ", ".join(f"`{f}`" for f in c["overlapping_files"][:5])
            lines.append(f"- Rama `{c['branch']}` tambien modifica: {files}")
        lines.append("")
    else:
        lines.append("**Posibles conflictos con otras ramas:** ninguno detectado.")
        lines.append("")

    markdown = "\n".join(lines)

    if a.post:
        body_file = Path(a.git_root) / f".briefing_{a.number}.md"
        body_file.write_text(markdown, encoding="utf-8")
        gh(a.repo, "issue-comment", "--number", str(a.number), "--body-file", str(body_file))
        body_file.unlink(missing_ok=True)

    print(json.dumps({"issue": a.number, "markdown": markdown, "posted": bool(a.post)}, ensure_ascii=False))


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--repo", required=True)
    p.add_argument("--number", type=int, required=True)
    p.add_argument("--git-root", required=True)
    p.add_argument("--graph-root", required=True)
    p.add_argument("--doc-globs")
    p.add_argument("--post", action="store_true")
    p.set_defaults(fn=cmd_generate)
    args = p.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
