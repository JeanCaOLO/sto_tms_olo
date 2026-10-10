"""Repite contra el backend REAL (sin BD) las escrituras que hizo el frontend en el mock.

Entrada: un JSON con el registro de operaciones (`window.__tarifasOpLog` del mock; en la consola del navegador:
`copy(JSON.stringify(window.__tarifasOpLog))`):
    [{ "op": "insert"|"update"|"delete", "table": "tarifas_...", "id": "...", "values": {...} }, ...]

Para cada una usa `tarifas_schema` y `tarifas_sql` de `backend/tarifas/src` (los mismos módulos
que corre la Lambda) y reporta lo que el backend contestaría: 400 (columna desconocida, valor
con tipo inválido), 405 (solo lectura / append-only). No toca ninguna base de datos.

Uso:  python3 -I docs/tarifador/cambios_hechos_para_probar_backend/herramientas/replay_payloads.py oplog.json [--json] [--ignore-uuid] [--jsonl]
  --ignore-uuid  no reporta ids que no tengan forma de uuid (las semillas de prueba usan ids legibles)
  --jsonl        la entrada es una operación por línea
  --required     también reporta INSERT sin columnas NOT NULL (las pruebas unitarias insertan filas parciales: úsalo con los recorridos de navegador)
"""

import json
import re
import sys
from collections import Counter
from pathlib import Path

REPO = Path(__file__).resolve().parents[4]
sys.path[:0] = [
    str(REPO / "backend/common-services/layers/tms_common"),
    str(REPO / "backend/tarifas/src"),
]

from tms_common.errors import HttpError  # noqa: E402
import tarifas_schema as schema  # noqa: E402
import tarifas_sql as sql  # noqa: E402

UUID = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")


def missing_required(table, values: dict) -> list[str]:
    """Columnas NOT NULL que el INSERT no trae (`undefined` desaparece al hacer JSON.stringify)."""
    return [
        f'falta "{c}" (NOT NULL, 23502 not_null_violation)'
        for c, spec in table.columns.items()
        if c != table.primary_key and not spec.get("nullable", False) and c not in values
    ]


def type_problems(table, values: dict) -> list[str]:
    """Lo que Postgres rechazaría al castear (`%s::uuid`, `::integer`…): el SQL se arma igual."""
    problems = []
    for column, value in values.items():
        if value is None:
            if not table.columns[column].get("nullable", False) and column != table.primary_key:
                problems.append(f'"{column}" es NOT NULL y llegó null')
            continue
        kind = table.columns[column]["type"]
        if kind == "uuid" and "--ignore-uuid" not in sys.argv and not (isinstance(value, str) and UUID.match(value)):
            problems.append(f'"{column}" es uuid y llegó {value!r} (22P02 invalid input syntax for type uuid)')
        elif kind == "int" and (isinstance(value, bool) or not isinstance(value, int)):
            if not (isinstance(value, str) and re.fullmatch(r"-?\d+", value)):
                problems.append(f'"{column}" es int y llegó {value!r}')
        elif kind == "boolean" and not isinstance(value, bool):
            problems.append(f'"{column}" es boolean y llegó {value!r}')
    return problems


def replay(entry: dict) -> dict:
    op, name = entry["op"], entry["table"]
    out = {"op": op, "table": name, "id": entry.get("id"), "status": 200, "problems": []}
    try:
        table = schema.table(name)
        if table.read_only:
            raise HttpError(405, f"{table.label}: es un dato del TMS y el liquidador solo lo lee.")
        if table.append_only and op in ("update", "delete"):
            raise HttpError(405, f"{table.label}: es append-only, no admite {op}.")
        values = entry.get("values")
        if op == "insert":
            sql.build_insert(table, values)
        elif op == "update":
            sql.build_update(table, str(entry["id"]), values, None)
        else:
            sql.build_delete(table, str(entry["id"]), None)
        if op != "delete":
            out["problems"] = type_problems(table, values) + (missing_required(table, values) if op == "insert" and "--required" in sys.argv else [])
            if out["problems"]:
                out["status"] = 500
    except HttpError as error:
        out["status"] = getattr(error, "status", None) or getattr(error, "status_code", 400)
        out["problems"] = [str(error)]
    return out


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args:
        print(__doc__)
        return 2
    text = Path(args[0]).read_text(encoding="utf-8")
    log = [json.loads(l) for l in text.splitlines() if l.strip()] if "--jsonl" in sys.argv else json.loads(text)
    results = [replay(e) for e in log]
    failed = [r for r in results if r["status"] != 200]
    if "--json" in sys.argv:
        print(json.dumps({"total": len(results), "failed": failed}, ensure_ascii=False, indent=1))
    else:
        print(f"{len(results)} operaciones; {len(failed)} fallarían contra el backend")
        grouped = Counter((r["op"], r["table"], r["status"], tuple(r["problems"])) for r in failed)
        by_kind = Counter(r["table"] for r in results)
        print("  por tabla:", ", ".join(f"{t}={n}" for t, n in by_kind.most_common()))
        for (op, table, status, problems), n in grouped.most_common():
            print(f"  [{status}] {op} {table} x{n}")
            for p in problems[:4]:
                print(f"        - {p}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
