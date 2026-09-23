"""Crea un usuario administrador real en Aurora (credencial + app_user + scope GLOBAL).

Resuelve el huevo y la gallina del primer admin: la API de administración exige
ya estar logueado como administrador. Crea el rol si no existe.

    ADMIN_PASSWORD='...' python backend/local/create_admin.py \
        --email admin@ologistics.com --name "Administrador" --role SuperAdministrador

Sin ADMIN_PASSWORD pide la contraseña por consola (no queda en el historial).
Lee la conexión de .env.local (TMS_DB_*) y requiere el túnel SSM a Aurora.
"""

import argparse
import getpass
import os
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
sys.path[0:0] = [str(BACKEND / "common-services" / "layers" / "tms_common"), str(BACKEND / "admin" / "src")]

from serve import load_env_files  # noqa: E402

load_env_files()

from tms_common import pg  # noqa: E402

import admin_payload  # noqa: E402
from admin_users import NewUser, insert_user  # noqa: E402

ROLE_SQL = "SELECT id FROM roles WHERE lower(name) = lower(%s)"
CREATE_ROLE_SQL = "INSERT INTO roles (name, description) VALUES (%s, %s) RETURNING id"
ORGANIZATION_SQL = "SELECT id, name FROM organizations ORDER BY name LIMIT 1"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--email", required=True)
    parser.add_argument("--name", required=True)
    parser.add_argument("--role", default="SuperAdministrador")
    return parser.parse_args()


def role_id(run: pg.Runner, name: str) -> str:
    rows = run(ROLE_SQL, [name]) or run(CREATE_ROLE_SQL, [name, "Acceso total al sistema"])
    return str(rows[0]["id"])


def main() -> None:
    args = parse_args()
    password = os.environ.get("ADMIN_PASSWORD") or getpass.getpass("Contraseña: ")
    body = {"email": args.email, "password": password}
    with pg.transaction() as run:
        organization = run(ORGANIZATION_SQL)[0]
        user = NewUser(args.name, admin_payload.email(body), admin_payload.password(body),
                       role_id(run, args.role), "active", [admin_payload.ScopeInput()])
        user_id = insert_user(run, str(organization["id"]), user)
    print(f"Creado {user.email} (app_user {user_id}) con rol {args.role}, alcance GLOBAL, "
          f"organización {organization['name']}.")


if __name__ == "__main__":
    main()
