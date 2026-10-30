"""Runner de migraciones de la app móvil sobre la BD compartida (Aurora, tms_olo).

Uso (desde backend/mobile, con el túnel abierto y las variables de .env cargadas):
    python scripts/migrate.py sql/m01_mobile_base.sql              # dry-run: aplica y hace ROLLBACK
    python scripts/migrate.py sql/m01_mobile_base.sql --execute    # aplica de verdad y registra el archivo
    python scripts/migrate.py sql/m01_mobile_base.sql --execute --force   # re-aplica una migración idempotente editada

Historial propio en `mobile_migrations` (no toca `schema_migrations` del TMS) con checksum: una migración ya
aplicada no se repite, y una editada después de aplicarse se detecta. Usa DB_ADMIN_USER/DB_ADMIN_PASSWORD (dueño
de las tablas) porque hace DDL; sin ellas cae al usuario de la app.
"""

import hashlib
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))
sys.path.insert(0, str(ROOT / "local"))

from env import load_env  # noqa: E402

load_env()

from mobile_api import config, db  # noqa: E402

CREATE_HISTORY = """
CREATE TABLE IF NOT EXISTS mobile_migrations (
  name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())
"""


def strip_transaction(sql: str) -> str:
    """El runner es dueño de la transacción: se quitan el begin;/commit; propios del archivo."""
    sql = re.sub(r"^\s*begin\s*;\s*", "", sql, flags=re.I | re.M, count=1)
    return re.sub(r"\s*commit\s*;\s*$", "", sql, flags=re.I)


def main(argv: list[str]) -> int:
    files = [a for a in argv if not a.startswith("--")]
    execute, force = "--execute" in argv, "--force" in argv
    if len(files) != 1:
        print(__doc__)
        return 1
    path = Path(files[0])
    raw = path.read_text(encoding="utf-8")
    checksum = hashlib.sha256(raw.encode()).hexdigest()
    connection = db.connect(config.admin_db_config(), autocommit=False)
    cursor = connection.cursor()
    try:
        cursor.execute(CREATE_HISTORY)
        cursor.execute("SELECT checksum FROM mobile_migrations WHERE name = %s", [path.name])
        applied = cursor.fetchone()
        if applied and not force:
            same = "mismo contenido" if applied[0] == checksum else "CONTENIDO DISTINTO (usa --force si es intencional)"
            print(f"{path.name} ya está aplicada ({same}). No se hace nada.")
            connection.rollback()
            return 0
        cursor.execute(strip_transaction(raw))
        if execute:
            cursor.execute(
                "INSERT INTO mobile_migrations (name, checksum) VALUES (%s, %s) "
                "ON CONFLICT (name) DO UPDATE SET checksum = EXCLUDED.checksum, applied_at = now()",
                [path.name, checksum])
            connection.commit()
            print(f"APLICADA: {path.name}")
        else:
            connection.rollback()
            print(f"DRY-RUN OK (rollback): {path.name} se puede aplicar. Usa --execute para aplicarla.")
        return 0
    except Exception as err:  # noqa: BLE001
        connection.rollback()
        print(f"ERROR en {path.name}: {err}")
        return 1
    finally:
        connection.close()


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
