"""Cambia la clave de UN chofer demo (solo usuarios @demo.tms.local con rol Chofer). Dry-run por defecto.

La clave nueva se lee de la variable de entorno DEMO_DRIVER_PASSWORD (nunca por argumento, para que no quede en el
historial ni en pantalla); en la BD solo se guarda el hash bcrypt (costo 10, igual que el TMS).

  PowerShell:  $env:DEMO_DRIVER_PASSWORD = "<tu clave>"
               python scripts/set_demo_password.py chofer.drv-demo-vn-1@demo.tms.local            (dry-run)
               python scripts/set_demo_password.py chofer.drv-demo-vn-1@demo.tms.local --execute
Usa las credenciales de administrador del .env (DB_ADMIN_*), como scripts/migrate.py.
"""

import os
import sys
from pathlib import Path

import bcrypt

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "local"))
sys.path.insert(0, str(ROOT / "src"))
from env import load_env  # noqa: E402

load_env()
from mobile_api import config, db  # noqa: E402

MIN_LENGTH = 8


def main(argv: list[str]) -> int:
    emails = [a.lower() for a in argv if not a.startswith("--")]
    execute = "--execute" in argv
    password = os.environ.get("DEMO_DRIVER_PASSWORD", "")
    if len(emails) != 1 or not emails[0].endswith("@demo.tms.local"):
        print("Indica UN correo @demo.tms.local.\n" + __doc__)
        return 1
    if len(password) < MIN_LENGTH:
        print(f"Define DEMO_DRIVER_PASSWORD (mínimo {MIN_LENGTH} caracteres) en esta terminal.")
        return 1
    connection = db.connect(config.admin_db_config(), autocommit=False)
    cursor = connection.cursor()
    try:
        cursor.execute(
            "SELECT c.auth_user_id FROM auth_credentials c JOIN app_users u ON u.auth_user_id = c.auth_user_id "
            "JOIN roles r ON r.id = u.role_id WHERE c.email = %s AND r.name = %s", [emails[0], config.driver_role_name()])
        rows = cursor.fetchall()
        if len(rows) != 1:
            print(f"{emails[0]}: no existe o no es un usuario con rol Chofer. No se cambia nada.")
            connection.rollback()
            return 1
        hashed = bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=10)).decode()
        cursor.execute("UPDATE auth_credentials SET password_hash = %s WHERE auth_user_id = %s", [hashed, rows[0][0]])
        # Las sesiones abiertas con la clave anterior dejan de renovarse.
        cursor.execute("UPDATE mobile_refresh_tokens SET revoked_at = now() WHERE revoked_at IS NULL AND app_user_id IN "
                       "(SELECT id FROM app_users WHERE auth_user_id = %s)", [rows[0][0]])
        if execute:
            connection.commit()
            print(f"CLAVE CAMBIADA para {emails[0]}.")
        else:
            connection.rollback()
            print(f"DRY-RUN OK (rollback): se cambiaría la clave de {emails[0]}. Usa --execute para aplicarla.")
        return 0
    finally:
        connection.close()


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
