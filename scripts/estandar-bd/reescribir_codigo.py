"""Reescribe el SQL literal del código a los nombres físicos de sql/59 (tbl_*, vw_*).

Solo toca apariciones en contexto SQL: después de FROM/JOIN/INTO/UPDATE/TABLE/REFERENCES/TRUNCATE
o calificadas (`public.orders`, `audit.events`). Si la tabla se usa como calificador de columna
(`orders.notes`) en el mismo archivo y el FROM/JOIN/INTO/UPDATE no trae alias, agrega `AS <viejo>`
para que el calificador siga resolviendo. Salta un nombre en un archivo si ahí es un CTE
(`WITH orders AS (`), y lo reporta.

No toca: el contrato HTTP lógico (`.from('orders')`, `/api/data/orders`), backend/data (traduce con
tms_common.db_names), eFlow (backend/eflow*, SQL Server), migraciones (sql/, backend/**/sql/).

Uso: python scripts/estandar-bd/reescribir_codigo.py [--aplicar]
"""

import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend" / "common-services" / "layers" / "tms_common"))
from tms_common.db_names import PHYSICAL  # noqa: E402

AUDIT = {"events": "tbl_events", "tracked_tables": "tbl_tracked_tables"}
DIRS = ["backend", "backend-planif", "server", "scripts", "src"]
EXTS = {".py", ".ts", ".tsx", ".js", ".mjs", ".cjs"}
SKIP = re.compile(r"node_modules|[\\/]dist[\\/]|\.aws-sam|__pycache__|scripts[\\/]estandar-bd|"
                  r"backend[\\/]data[\\/]src|backend[\\/]eflow|[\\/]sql[\\/]")
NAMES = "|".join(sorted(map(re.escape, PHYSICAL), key=len, reverse=True))
KW = r"(from|join|into|update|table|references|truncate)"
RX_CTX = re.compile(rf"(?i)(?<![\w.]){KW}(\s+(?:only\s+|if\s+(?:not\s+)?exists\s+)?)(\")?(public\.)?({NAMES})(?(3)\")(?![\w-])")
RX_QUAL = re.compile(rf"(?<![\w.])public\.({NAMES})(?![\w-])")
RX_AUDIT = re.compile(r"(?<![\w.])audit\.(events|tracked_tables)(?![\w])")
SQL_WORDS = {
    "where", "set", "on", "join", "left", "right", "inner", "outer", "full", "cross", "order", "group", "limit",
    "offset", "using", "values", "select", "returning", "default", "for", "union", "having", "natural", "lateral",
    "window", "except", "intersect", "and", "or", "then", "when", "end", "is", "not", "in", "partition",
    "overriding", "fetch", "tablesample", "only", "add", "alter", "drop", "rename", "owner", "enable", "disable",
    "cascade", "restrict", "continue", "restart", "nowait", "skip", "with", "do", "if",
}
ALIASABLE = {"from", "join", "into", "update"}
# Métodos/atributos de lenguaje que NO son un calificador SQL de columna (`orders.length`, `rows.append`).
NOT_COLUMN = ("length|map|filter|push|forEach|find|some|every|reduce|rows|get|append|items|keys|values|update|sort|"
              "join|slice|includes|has|add|size|pop|extend|count|index|copy|setdefault|flatMap|concat|at|entries")
WINDOW = 12  # líneas alrededor del FROM/INTO/UPDATE donde se busca `tabla.columna`


def qualified_nearby(lines: list[str], i: int, name: str) -> bool:
    chunk = "".join(lines[max(0, i - WINDOW): i + WINDOW + 1])
    return re.search(rf"(?<![\w.]){re.escape(name)}\.(?!(?:{NOT_COLUMN})\b)(?:[a-z_]\w*|\{{)", chunk) is not None


def rewrite(text: str, path: str, stats: Counter, skipped: list) -> str:
    ctes = {n for n in PHYSICAL if re.search(rf"(?i)(\bwith\s+(recursive\s+)?|,\s*){re.escape(n)}\s+as\s*(materialized\s+)?\(", text)}
    for n in ctes:
        skipped.append((path, n, "CTE con el mismo nombre"))
    out = []
    lines = text.splitlines(keepends=True)
    for i, line in enumerate(lines):
        if path.endswith(".py") and re.match(r"\s*(from|import)\s+[\w.]+(\s+import\b|\s*$)", line):
            out.append(line)
            continue

        def ctx(m: re.Match) -> str:
            kw, space, q, pub, name = m.group(1), m.group(2), m.group(3) or "", m.group(4) or "", m.group(5)
            if name in ctes:
                return m.group(0)
            rest = line[m.end():]
            alias = ""
            nxt = re.match(r"\s*([A-Za-z_]\w*)", rest)
            has_alias = bool(nxt) and (nxt.group(1).lower() == "as" or nxt.group(1).lower() not in SQL_WORDS)
            if not has_alias and kw.lower() in ALIASABLE and qualified_nearby(lines, i, name):
                alias = f" AS {name}"
                stats["alias"] += 1
            stats[name] += 1
            return f"{kw}{space}{q}{pub}{PHYSICAL[name]}{q}{alias}"

        new = RX_CTX.sub(ctx, line)
        new = RX_QUAL.sub(lambda m: m.group(0) if m.group(1) in ctes else (stats.update([m.group(1)]) or f"public.{PHYSICAL[m.group(1)]}"), new)
        new = RX_AUDIT.sub(lambda m: stats.update(["audit." + m.group(1)]) or f"audit.{AUDIT[m.group(1)]}", new)
        out.append(new)
    return "".join(out)


def main() -> None:
    apply = "--aplicar" in sys.argv
    stats: Counter = Counter()
    skipped: list = []
    files = 0
    for d in DIRS:
        base = ROOT / d
        if not base.exists():
            continue
        for p in base.rglob("*"):
            if p.suffix not in EXTS or not p.is_file() or SKIP.search(str(p)):
                continue
            rel = p.relative_to(ROOT).as_posix()
            # Frontend: el contrato es lógico; solo se tocan los tests que van directo a Aurora.
            # schema.test.ts prueba el DDL que genera schema.ts (historia de sql/19), no se toca.
            if rel.startswith("src/") and ("__tests__" not in rel and ".test." not in rel or rel.endswith("data/__tests__/schema.test.ts")):
                continue
            raw = p.read_bytes().decode("utf-8")
            new = rewrite(raw, p.relative_to(ROOT).as_posix(), stats, skipped)
            if new != raw:
                files += 1
                print(f"{'reescrito' if apply else 'cambiaría'}: {p.relative_to(ROOT).as_posix()}")
                if apply:
                    p.write_bytes(new.encode("utf-8"))
    print(f"\n{files} archivos; {sum(v for k, v in stats.items() if k != 'alias')} reemplazos; "
          f"{stats['alias']} con alias agregado")
    for s in skipped:
        print("SALTADO:", *s)


if __name__ == "__main__":
    main()
