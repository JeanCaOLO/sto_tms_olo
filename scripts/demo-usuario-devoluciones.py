"""Usuario DEMO con el rol "Devoluciones", para probar el módulo en la web. Dry-run por defecto.

Crea (en una transacción) la credencial + el usuario de app + un alcance global del rol, igual que la API de
administración de usuarios. Solo toca el correo demo.devoluciones@demo.tms.local; `--clean` lo borra.

La clave se lee de DEMO_USER_PASSWORD (nunca por argumento) y solo se guarda su hash bcrypt.

  PowerShell:  $env:DEMO_USER_PASSWORD = "<clave, mín. 8 caracteres>"
               python scripts/demo-usuario-devoluciones.py                      (dry-run)
               python scripts/demo-usuario-devoluciones.py --execute
               python scripts/demo-usuario-devoluciones.py --clean --execute    (borra el usuario demo)

Conecta con TMS_DB_* de .env.local (túnel a Aurora abierto).
"""

import os
import sys
from pathlib import Path
from uuid import uuid4

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend" / "common-services" / "layers" / "tms_common"))

for line in (ROOT / ".env.local").read_text(encoding="utf-8").splitlines():
    key, sep, value = line.partition("=")
    if sep and not key.strip().startswith("#"):
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))

from tms_common import pg  # noqa: E402
from tms_common.passwords import MIN_PASSWORD_LENGTH, hash_password  # noqa: E402

EMAIL = "demo.devoluciones@demo.tms.local"
ROLE = "Devoluciones"
FULL_NAME = "Usuario Demo Devoluciones"


def create(run) -> None:
    password = os.environ.get("DEMO_USER_PASSWORD", "")
    if len(password) < MIN_PASSWORD_LENGTH:
        raise SystemExit(f"Define DEMO_USER_PASSWORD (mínimo {MIN_PASSWORD_LENGTH} caracteres).")
    if run("SELECT 1 FROM tbl_auth_credentials WHERE email = %s", [EMAIL]):
        raise SystemExit(f"{EMAIL} ya existe: usa --clean --execute para borrarlo y volver a crearlo.")
    role = run("SELECT id FROM tbl_roles WHERE name = %s", [ROLE])
    if not role:
        raise SystemExit(f'No existe el rol "{ROLE}": falta la migración sql/60.')
    org = run("SELECT organization_id FROM tbl_app_users WHERE organization_id IS NOT NULL LIMIT 1")
    if not org:
        raise SystemExit("No hay una organización de la que copiar organization_id.")
    auth_user_id = str(uuid4())
    run("INSERT INTO tbl_auth_credentials (auth_user_id, email, password_hash) VALUES (%s, %s, %s)",
        [auth_user_id, EMAIL, hash_password(password)])
    user = run("INSERT INTO tbl_app_users (auth_user_id, organization_id, full_name, email, role_id, is_active, carrier_id) "
               "VALUES (%s, %s, %s, %s, %s, true, NULL) RETURNING id",
               [auth_user_id, org[0]["organization_id"], FULL_NAME, EMAIL, role[0]["id"]])
    run("INSERT INTO tbl_user_scopes (app_user_id, role_id, country_id, warehouse_id, customer_id) VALUES (%s, %s, NULL, NULL, NULL)",
        [user[0]["id"], role[0]["id"]])
    print(f"Creado {EMAIL} con rol {ROLE} y alcance global.")


def clean(run) -> None:
    user = run("SELECT id, auth_user_id FROM tbl_app_users WHERE email = %s", [EMAIL])
    if not user:
        print("No hay usuario demo que borrar.")
        return
    run("DELETE FROM tbl_user_scopes WHERE app_user_id = %s", [user[0]["id"]])
    run("DELETE FROM tbl_app_users WHERE id = %s", [user[0]["id"]])
    run("DELETE FROM tbl_auth_credentials WHERE auth_user_id = %s", [user[0]["auth_user_id"]])
    print(f"Borrado {EMAIL}.")


def main() -> int:
    execute, wipe = "--execute" in sys.argv, "--clean" in sys.argv
    with pg.transaction() as run:
        (clean if wipe else create)(run)
        if not execute:
            raise _DryRun()
    print("APLICADO.")
    return 0


class _DryRun(Exception):
    """Fuerza el ROLLBACK de la transacción en el ensayo."""


if __name__ == "__main__":
    try:
        sys.exit(main())
    except _DryRun:
        print("DRY-RUN (rollback): no se cambió nada. Usa --execute para aplicar.")
