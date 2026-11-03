"""Consultas del código NUEVO (nombres tbl_*) contra Aurora, dentro de la transacción de humo_59.py.

1. Barrido: toda constante SQL de backend/**/src que nombra tbl_* se PREPARA (parsea y resuelve
   tablas/columnas sin ejecutar). "No se pudo inferir el tipo de un parámetro" cuenta como no concluyente.
2. Ejecución real: bandeja.listar, data API (select con embed + count), tarifas build_find sobre
   la vista, ingest_items._UPSERT (ON CONFLICT en tbl_order_items AS order_items).
Lo llama `python scripts/estandar-bd/humo_59.py --codigo`; nunca hace COMMIT.
"""

import ast
import importlib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BACKEND = ROOT / "backend"
LAYER = BACKEND / "common-services" / "layers" / "tms_common"
SKIP = re.compile(r"[\\/](eflow|eflow-sim|tests|pruebas|scripts|local)[\\/]")
SQL_START = re.compile(r"^\s*(select\s|insert\s+into\s|update\s+\S+\s+(as\s+\w+\s+)?set\s|delete\s+from\s|with\s+(recursive\s+)?\w+\s+as\s)", re.I)
EFLOW = re.compile(r"\bCONVERT\(|\bTOP\s*\(|\bIDEXPEDICION\b")  # SQL Server de eFlow: no es tms_olo
BASE_COMMIT = "6551778"  # main-v2 antes del renombrado = lo que está desplegado


def _to_dollar(sql: str) -> str | None:
    sql = re.sub(r"\{(scope|where_extra|extra|filtro|filters)\}", "", sql)  # .format(...) que agrega filtros
    sql = re.sub(r"\{(window|radius|limit|minutes|dias|days)\}", "1", sql)
    if re.search(r"\{[a-z_]*\}", sql):
        return None  # plantilla con un trozo de SQL que arma el código: no concluyente
    names: dict[str, int] = {}
    n = 0

    def named(m):
        nonlocal n
        if m.group(1) not in names:
            n += 1
            names[m.group(1)] = n
        return f"${names[m.group(1)]}"

    sql = re.sub(r"%\((\w+)\)s", named, sql)

    def pos(_m):
        nonlocal n
        n += 1
        return f"${n}"

    sql = re.sub(r"%s", pos, sql)
    return sql.replace("%%", "%")


def constants(old: bool = False) -> list[tuple[str, str]]:
    """Constantes SQL del backend. old=True: las del código DESPLEGADO (main-v2, antes del renombrado)."""
    import subprocess  # noqa: PLC0415

    out = []
    for p in BACKEND.rglob("*.py"):
        if SKIP.search(str(p)) or "src" not in p.parts:
            continue
        rel = p.relative_to(ROOT).as_posix()
        if old:
            r = subprocess.run(["git", "show", f"{BASE_COMMIT}:{rel}"], cwd=ROOT, capture_output=True)
            if r.returncode:
                continue
            text = r.stdout.decode("utf-8")
        else:
            text = p.read_text(encoding="utf-8")
        tree = ast.parse(text)
        for node in ast.walk(tree):
            if isinstance(node, ast.Constant) and isinstance(node.value, str):
                s = node.value
                if (old or "tbl_" in s) and SQL_START.match(s) and ".dbo." not in s and not EFLOW.search(s) and re.search(r"(?i)\b(from|into|update)\s", s):
                    out.append((f"{rel}:{node.lineno}", s))
    return out


def sweep(cur, items, label):
    ok = inconclusive = 0
    fails = []
    for i, (where, sql) in enumerate(items):
        prepared = _to_dollar(sql)
        if prepared is None:
            inconclusive += 1
            continue
        cur.execute("savepoint humo_prep")
        try:
            cur.execute(f"prepare humo_{i} as {prepared}")
            cur.execute(f"deallocate humo_{i}")
            ok += 1
        except Exception as e:  # noqa: BLE001
            msg = str(e).splitlines()[0]
            if "could not determine data type" in msg or "syntax error at end of input" in msg \
                    or "syntax error at or near \"$" in msg:
                inconclusive += 1
            else:
                fails.append(f"{where}: {msg}")
        cur.execute("rollback to savepoint humo_prep")
    return (f"PREPARE de {len(items)} constantes SQL {label} ({ok} OK, {inconclusive} no concluyentes)",
            not fails, "; ".join(fails[:8]))


def run(cur):
    results = [sweep(cur, constants(), "del backend NUEVO (tbl_*)"),
               sweep(cur, constants(old=True), f"del backend DESPLEGADO ({BASE_COMMIT}, nombres viejos → vistas)")]

    # --- ejecución real con tms_common.pg apuntando a esta transacción
    sys.path.insert(0, str(LAYER))
    from tms_common import pg  # noqa: PLC0415

    def query(sql, params=()):
        cur.execute(sql, list(params))
        if cur.description is None:
            return []
        cols = [d[0] for d in cur.description]
        return [dict(zip(cols, r)) for r in cur.fetchall()]

    pg.query = query

    def load(stack: str, module: str):
        src = str(BACKEND / stack / "src")
        sys.path.insert(0, src)
        try:
            for m in ("app", "schema", "relations", "select_query", "select_parser", "mutations", module):
                sys.modules.pop(m, None)
            return importlib.import_module(module)
        finally:
            sys.path.remove(src)

    def attempt(name, fn):
        cur.execute("savepoint humo_exec")
        try:
            ok_, detail = fn()
            results.append((name, ok_, detail))
        except Exception as e:  # noqa: BLE001
            results.append((name, False, f"{type(e).__name__}: {str(e).splitlines()[0]}"))
            cur.execute("rollback to savepoint humo_exec")
            return
        cur.execute("release savepoint humo_exec")

    org = query("select organization_id from tbl_orders where organization_id is not null limit 1")[0]["organization_id"]

    def bandeja():
        rows = load("planning", "bandeja").listar(str(org), None, None)
        return True, f"{len(rows)} filas"
    attempt("bandeja.listar (tbl_orders/tbl_returns/tbl_final_customers)", bandeja)

    def data_api():
        sys.path.insert(0, str(BACKEND / "data" / "src"))
        try:
            for m in ("schema", "relations", "select_query", "select_parser", "mutations"):
                sys.modules.pop(m, None)
            schema = importlib.import_module("schema")
            schema.load_columns(lambda s: query(s))
            sq = importlib.import_module("select_query")
            sql, params = sq.build_list_query("orders", "id,order_number,customers(name,code)", [], None, 5)
            rows = query(sql, params)
            csql, cparams = sq.build_count_query("drivers", [["carriers.country_id", "neq", "00000000-0000-0000-0000-000000000000"]])
            total = query(csql, cparams)[0]["count"]
            embed_ok = all("customers" in r for r in rows)
            return ('FROM "tbl_orders"' in sql and embed_ok, f"{len(rows)} pedidos con embed customers; count drivers={total}")
        finally:
            sys.path.remove(str(BACKEND / "data" / "src"))
    attempt("data API: select con embed customers(...) + count con filtro de tabla padre", data_api)

    def tarifas():
        sys.path.insert(0, str(BACKEND / "tarifas" / "src"))
        try:
            for m in ("tarifas_schema", "tarifas_sql"):
                sys.modules.pop(m, None)
            ts = importlib.import_module("tarifas_schema")
            tq = importlib.import_module("tarifas_sql")
            sql, params = tq.build_find(ts.table("tarifas_v_viajes"), {"limit": 3}, None)
            rows = query(sql, params)
            sql2, params2 = tq.build_find(ts.table("tarifas_settlements"), {"limit": 3}, None)
            rows2 = query(sql2, params2)
            return ('"vw_tarifas_viajes"' in sql and '"tbl_tarifas_settlements"' in sql2,
                    f"{len(rows)} viajes, {len(rows2)} liquidaciones")
        finally:
            sys.path.remove(str(BACKEND / "tarifas" / "src"))
    attempt("tarifas: build_find sobre vw_tarifas_viajes y tbl_tarifas_settlements", tarifas)

    def ingest_items():
        mod = load("planning", "ingest_items")
        cols = mod._CAMPOS
        row = query(f"select {', '.join(cols)} from tbl_order_items limit 1")
        if not row:
            return True, "sin filas en tbl_order_items (no se probó)"
        payload = json.dumps([{k: (str(v) if v is not None and not isinstance(v, (int, float, bool)) else v)
                               for k, v in row[0].items()}], default=str)
        query(mod._UPSERT, [payload])
        return True, "UPSERT ejecutado sobre la misma fila (ON CONFLICT DO UPDATE ... WHERE)"
    attempt("ingest_items._UPSERT real (tbl_order_items AS order_items, ON CONFLICT)", ingest_items)
    return results
