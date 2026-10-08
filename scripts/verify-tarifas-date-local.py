"""Verifica contra Aurora que el SQL del backend nuevo de tarifas funciona con `settlement_date` como `date`,
SIN dejar ningún cambio en la base.

Contexto: hoy la columna es `text` (sql/29) porque el backend desplegado manda `::text`. El backend del repo
(`backend/tarifas/src`) manda `::date` (manifiesto). Esta prueba corre dentro de UNA transacción:

    BEGIN; ALTER COLUMN settlement_date TYPE date; <consultas reales del backend>; ROLLBACK;

y al final confirma que la columna sigue siendo `text`. Solo LEE el código de backend/tarifas; no lo modifica.
El ALTER toma un candado breve sobre `tarifas_settlements` (tabla chica) y `lock_timeout` lo corta a los 5 s.

Uso (túnel a Aurora abierto):
    py -3.13 scripts/verify-tarifas-date-local.py
"""

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND / "common-services" / "layers" / "tms_common"))
sys.path.insert(0, str(BACKEND / "tarifas" / "src"))

import pg8000.dbapi  # noqa: E402

import tarifas_schema  # noqa: E402
import tarifas_sql  # noqa: E402


def load_env() -> None:
    path = ROOT / ".env.local"
    for line in path.read_text(encoding="utf-8").splitlines():
        key, sep, value = line.partition("=")
        if sep and not key.strip().startswith("#"):
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def column_type(cur) -> str:
    cur.execute("SELECT data_type FROM information_schema.columns WHERE table_schema = current_schema() "
                "AND table_name = 'tarifas_settlements' AND column_name = 'settlement_date'")
    return cur.fetchone()[0]


def run(cur, table, options):
    sql, params = tarifas_sql.build_find(table, options, None)
    cur.execute(sql, params)
    return cur.fetchall()


def main() -> int:
    load_env()
    connection = pg8000.dbapi.connect(
        host=os.environ.get("TMS_DB_HOST", "localhost"), port=int(os.environ.get("TMS_DB_PORT", "5432")),
        user=os.environ["TMS_DB_ADMIN_USER" if "TMS_DB_ADMIN_USER" in os.environ else "TMS_DB_USER"],
        password=os.environ["TMS_DB_ADMIN_PASSWORD" if "TMS_DB_ADMIN_PASSWORD" in os.environ else "TMS_DB_PASSWORD"],
        database=os.environ.get("TMS_DB_NAME", "tms_olo"), ssl_context=True,
    )
    cur = connection.cursor()
    table = tarifas_schema.table("tarifas_settlements")
    failures: list[str] = []
    try:
        before = column_type(cur)
        print(f"Tipo antes: {before}")
        cur.execute("SET LOCAL lock_timeout = '5s'")
        cur.execute("ALTER TABLE tarifas_settlements ALTER COLUMN settlement_date TYPE date "
                    "USING settlement_date::date")
        print(f"Tipo dentro de la transacción: {column_type(cur)}")

        checks = {
            "filtro Desde": {"where": [{"column": "settlement_date", "op": "gte", "value": "2000-01-01"}]},
            "filtro Hasta": {"where": [{"column": "settlement_date", "op": "lte", "value": "2999-12-31"}]},
            "igualdad": {"where": [{"column": "settlement_date", "op": "eq", "value": "2026-08-28"}]},
            "orden": {"orderBy": [{"column": "settlement_date", "direction": "desc"},
                                  {"column": "number", "direction": "desc"}]},
        }
        for label, options in checks.items():
            rows = run(cur, table, options)
            print(f"  OK  {label}: {len(rows)} fila(s)")

        # Cursor: página 1 de tamaño 1 y la siguiente con `after`.
        order = [{"column": "settlement_date", "direction": "desc"}, {"column": "number", "direction": "desc"}]
        sql, params = tarifas_sql.build_find(table, {"orderBy": order, "limit": 1}, None)
        cur.execute(sql, params)
        columns = [c[0] for c in cur.description]
        first = cur.fetchall()
        if first:
            row = dict(zip(columns, first[0]))
            after = {"settlement_date": str(row["settlement_date"]), "number": row["number"]}
            nxt = run(cur, table, {"orderBy": order, "after": after, "limit": 50})
            print(f"  OK  cursor: pagina 1 = {row['number']}, siguientes = {len(nxt)}")
        else:
            print("  --  cursor: no hay liquidaciones para paginar")
    except Exception as error:  # noqa: BLE001 - se informa y se hace rollback
        failures.append(str(error))
        print(f"  FALLA: {error}")
    finally:
        connection.rollback()
        cur = connection.cursor()
        after_type = column_type(cur)
        print(f"Tipo después del ROLLBACK: {after_type}")
        if after_type != before:
            failures.append(f"la columna quedó como {after_type} (esperado {before})")
        connection.close()

    print("RESULTADO:", "OK" if not failures else "FALLÓ -> " + "; ".join(failures))
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())
