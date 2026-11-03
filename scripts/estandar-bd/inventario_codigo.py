"""Inventario del impacto del renombrado (sql/59) en el código: archivo, línea, objeto y tipo de uso.

Lee los pares viejo→nuevo de sql/59 y busca cada nombre viejo con límites de palabra en
backend/, backend-planif/, src/, scripts/ y server/ (las migraciones viejas de sql/ son historia).
Clasifica cada aparición:
  sql        dentro de SQL (FROM/JOIN/INTO/UPDATE/TABLE/REFERENCES/ON CONFLICT ON CONSTRAINT ...)
  qualified  calificado (`public.orders`, `audit.events`)
  api        nombre lógico del contrato HTTP (`.from('orders')`, `/api/data/orders`, literal suelto)
  otro       mención en comentario, ruta de UI, palabra común, etc.

Uso: python scripts/estandar-bd/inventario_codigo.py [--md salida.md] [--solo-sql]
"""

import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SQL59 = ROOT / "sql" / "59_estandar_oltp_renombrado.sql"
DIRS = ["backend", "backend-planif", "src", "scripts", "server"]
EXTS = {".py", ".ts", ".tsx", ".js", ".mjs", ".cjs", ".sql", ".json", ".yaml", ".yml"}
SKIP = re.compile(r"node_modules|[\\/]dist[\\/]|\.aws-sam|__pycache__|scripts[\\/]estandar-bd|\.venv")
SQL_KW = re.compile(
    r"\b(from|join|into|update|table|references|truncate|exists|lock|only)\s+(?:only\s+)?(?:\"?(public|audit)\"?\.)?\"?$",
    re.I)


def pairs() -> dict[str, tuple[str, str]]:
    """viejo -> (nuevo, tipo)"""
    out = {}
    text = SQL59.read_text(encoding="utf-8")
    for kind, sch, old, new in re.findall(r"'alter (table|view|sequence) (public|audit)\.(\w+) rename to (\w+)'", text):
        if kind == "table" and "rename constraint" in old:
            continue
        out.setdefault(old, (new, kind, sch))
    for con, new in re.findall(r"rename constraint (\w+) to (\w+)'", text):
        out.setdefault(con, (new, "constraint", ""))
    for idx, new in re.findall(r"'alter index (?:public|audit)\.(\w+) rename to (\w+)'", text):
        out.setdefault(idx, (new, "index", ""))
    return out


def classify(line: str, start: int, end: int, name: str, kind: str) -> str:
    before = line[:start]
    if kind in ("constraint", "index"):
        return "sql"
    if re.search(r"\b(public|audit)\.\"?$", before):
        return "qualified" if not SQL_KW.search(before) else "sql"
    if SQL_KW.search(before):
        return "sql"
    if re.search(r"\.from\(\s*['\"`]$", before) or re.search(r"/api/(data|tarifas)/$", before):
        return "api"
    quote = before[-1:] if before else ""
    after = line[end:end + 1]
    if quote in "'\"`" and after == quote:
        return "api"
    return "otro"


def files_at(ref: str | None):
    """(ruta relativa, texto) del árbol de trabajo o de un commit (git show)."""
    import subprocess  # noqa: PLC0415

    if ref:
        names = subprocess.run(["git", "ls-tree", "-r", "--name-only", ref], cwd=ROOT, capture_output=True,
                               text=True).stdout.splitlines()
        for n in names:
            if n.split("/")[0] in DIRS and Path(n).suffix in EXTS and not SKIP.search(n):
                r = subprocess.run(["git", "show", f"{ref}:{n}"], cwd=ROOT, capture_output=True)
                yield n, r.stdout.decode("utf-8", errors="replace")
        return
    for d in DIRS:
        base = ROOT / d
        if base.exists():
            for p in base.rglob("*"):
                if p.suffix in EXTS and p.is_file() and not SKIP.search(str(p)):
                    yield p.relative_to(ROOT).as_posix(), p.read_text(encoding="utf-8", errors="replace")


def action(path: str, use: str) -> str:
    if path.startswith(("backend/eflow", "backend/mobile/sql/")):
        return "sin cambio (eFlow / migración)"
    if use in ("sql", "qualified"):
        if path.startswith("backend/data/src/"):
            return "traduce db_names"
        if path.startswith("src/") and "__tests__" not in path and ".test." not in path:
            return "sin cambio (comentario del frontend)"
        if path.endswith("data/__tests__/schema.test.ts"):
            return "sin cambio (DDL histórico de schema.ts)"
        return "reescrito a físico"
    if use == "api":
        return "lógico (contrato HTTP / clave); traduce db_names"
    return "sin cambio"


def main() -> None:
    mp = {k: v for k, v in pairs().items() if v[2] != "audit"}  # audit.* se busca solo calificado (abajo)
    rx = re.compile(r"(?<![\w.$/-])(" + "|".join(sorted(map(re.escape, mp), key=len, reverse=True)) + r")(?![\w-])")
    rx_audit = re.compile(r"(?<![\w.])audit\.(events|tracked_tables)\b")
    ref = sys.argv[sys.argv.index("--ref") + 1] if "--ref" in sys.argv else None
    rows = []
    for rel, text in files_at(ref):
        for i, line in enumerate(text.splitlines(), 1):
            for m in rx_audit.finditer(line):
                rows.append((rel, i, "audit." + m.group(1), "audit.tbl_" + m.group(1), "table", "qualified", line.strip()[:140]))
            for m in rx.finditer(line):
                name = m.group(1)
                new, kind, _ = mp[name]
                rows.append((rel, i, name, new, kind, classify(line, m.start(), m.end(), name, kind), line.strip()[:140]))
    solo_sql = "--solo-sql" in sys.argv
    if "--md" in sys.argv:
        out = Path(sys.argv[sys.argv.index("--md") + 1])
        c = Counter(r[5] for r in rows)
        det = [r for r in rows if r[5] in ("sql", "qualified")] if solo_sql else rows
        lines = [f"Total: {len(rows)} apariciones ({dict(c)}).", "",
                 "### Por archivo", "", "| Archivo | sql | qualified | api | otro | Acción (sql) |", "|---|---|---|---|---|---|"]
        per = {}
        for r in rows:
            per.setdefault(r[0], Counter())[r[5]] += 1
        for f in sorted(per):
            k = per[f]
            lines.append(f"| `{f}` | {k['sql']} | {k['qualified']} | {k['api']} | {k['otro']} | {action(f, 'sql')} |")
        lines += ["", "### Detalle (uso en SQL)" if solo_sql else "### Detalle", "",
                  "| Archivo | Línea | Objeto | Nuevo | Tipo de objeto | Uso | Acción |", "|---|---|---|---|---|---|---|"]
        lines += [f"| `{f}` | {i} | `{n}` | `{nw}` | {k} | {u} | {action(f, u)} |" for f, i, n, nw, k, u, _ in det]
        out.write_text("\n".join(lines) + "\n", encoding="utf-8")
        print(f"{len(rows)} apariciones → {out} ({dict(c)})")
        return
    if solo_sql:
        rows = [r for r in rows if r[5] in ("sql", "qualified")]
    for r in rows:
        print(f"{r[0]}:{r[1]} [{r[5]}] {r[2]} -> {r[3]} | {r[6]}")
    print(Counter(r[5] for r in rows), Counter(r[0].split('/')[0] for r in rows))


if __name__ == "__main__":
    main()
