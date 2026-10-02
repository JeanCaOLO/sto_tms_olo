"""Activa el rol de BD de la aplicación (tms_app, sql/18): contraseña nueva,
secreto en Secrets Manager y .env.local apuntando a tms_app.

Pasos (en este orden, para no perder nunca la contraseña):
  1. Genera una contraseña aleatoria (40 caracteres alfanuméricos).
  2. La guarda en Secrets Manager `/dev/tms/db-app` (la crea o le pone un valor nuevo).
  3. Se la asigna a tms_app en Aurora, conectado como el DUEÑO (olo_db).
  4. Verifica que tms_app entra, lee datos y NO puede modificar audit.events.
  5. Reescribe en .env.local: TMS_DB_USER/PASSWORD = tms_app y
     TMS_DB_ADMIN_USER/PASSWORD = el dueño (lo usa scripts/run-migration.mjs).
La contraseña nunca se imprime. Re-correrlo rota la contraseña.

    python backend/local/activar_rol_tms_app.py

Requiere el túnel a Aurora (scripts/tunel-aurora.ps1) y la CLI de AWS con
permiso secretsmanager:CreateSecret/PutSecretValue sobre /dev/tms/*.
"""

import json
import os
import re
import secrets
import string
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND / "local"))
sys.path.insert(0, str(BACKEND / "common-services" / "layers" / "tms_common"))

from serve import load_env_files  # noqa: E402

ENV_FILE = ROOT / ".env.local"
APP_ROLE = "tms_app"
SECRET_NAME = "/dev/tms/db-app"
REGION = "us-east-2"
AURORA_HOST = "db-tms-olo.cluster-cjo2ss6io0lb.us-east-2.rds.amazonaws.com"
PASSWORD_LENGTH = 40


def _env_value(text: str, key: str) -> str | None:
    match = re.search(rf"(?m)^{key}=(.*)$", text)
    return match.group(1).strip() if match else None


def _owner_credentials(text: str) -> tuple[str, str]:
    user = _env_value(text, "TMS_DB_ADMIN_USER") or _env_value(text, "TMS_DB_USER")
    password = _env_value(text, "TMS_DB_ADMIN_PASSWORD") or _env_value(text, "TMS_DB_PASSWORD")
    if not user or not password or user == APP_ROLE:
        raise SystemExit("No encuentro las credenciales del dueño (olo_db) en .env.local.")
    return user, password


def _aws(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run(["aws", *args, "--region", REGION], capture_output=True, text=True, shell=os.name == "nt")


def _store_secret(password: str) -> None:
    value = {"host": AURORA_HOST, "port": 5432, "username": APP_ROLE, "password": password, "dbname": "tms_olo"}
    handle, path = tempfile.mkstemp(suffix=".json")
    try:
        with os.fdopen(handle, "w", encoding="utf-8") as file:
            json.dump(value, file)
        source = f"file://{path}"
        result = _aws("secretsmanager", "create-secret", "--name", SECRET_NAME,
                      "--description", "TMS - credencial de BD de la APLICACION (rol tms_app, sin DDL). Ver sql/18.",
                      "--secret-string", source)
        if result.returncode != 0 and "ResourceExistsException" in result.stderr:
            result = _aws("secretsmanager", "put-secret-value", "--secret-id", SECRET_NAME, "--secret-string", source)
        if result.returncode != 0:
            raise SystemExit(f"No se pudo guardar el secreto: {result.stderr.strip()[:300]}")
    finally:
        os.remove(path)
    print(f"1/4 Secreto {SECRET_NAME} guardado.")


def _connect_as(user: str, password: str):
    os.environ["TMS_DB_USER"], os.environ["TMS_DB_PASSWORD"] = user, password
    from tms_common import pg
    pg._connection = None
    return pg


def _set_password(owner: tuple[str, str], password: str) -> None:
    pg = _connect_as(*owner)
    pg.query(f"ALTER ROLE {APP_ROLE} PASSWORD '{password}'")  # alfanumérica: sin comillas que escapar
    pg._connection = None
    print(f"2/4 Contraseña de {APP_ROLE} asignada.")


def _verify(password: str) -> None:
    pg = _connect_as(APP_ROLE, password)
    assert pg.query("SELECT current_user AS u")[0]["u"] == APP_ROLE
    pg.query("SELECT count(*) FROM delivery_points")
    pg.query("SELECT count(*) FROM audit.events")
    try:
        pg.query("UPDATE audit.events SET action = action WHERE false")
        raise SystemExit("ERROR: tms_app pudo hacer UPDATE en audit.events (no debería).")
    except SystemExit:
        raise
    except Exception:
        pass  # esperado: sin permiso
    pg._connection = None
    print(f"3/4 {APP_ROLE} entra, lee datos y no puede modificar la bitácora.")


def _rewrite_env(text: str, owner: tuple[str, str], password: str) -> None:
    lines = [line for line in text.splitlines()
             if not re.match(r"^(TMS_DB_USER|TMS_DB_PASSWORD|TMS_DB_ADMIN_USER|TMS_DB_ADMIN_PASSWORD)=", line)
             and not line.startswith("# Dueño de las tablas: SOLO para migraciones")]
    lines += [
        f"TMS_DB_USER={APP_ROLE}",
        f"TMS_DB_PASSWORD={password}",
        "# Dueño de las tablas: SOLO para migraciones/DDL (scripts/run-migration.mjs). La app usa tms_app (sql/18).",
        f"TMS_DB_ADMIN_USER={owner[0]}",
        f"TMS_DB_ADMIN_PASSWORD={owner[1]}",
    ]
    ENV_FILE.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("4/4 .env.local actualizado (app = tms_app, migraciones = dueño).")


def main() -> None:
    load_env_files()
    text = ENV_FILE.read_text(encoding="utf-8")
    owner = _owner_credentials(text)
    password = "".join(secrets.choice(string.ascii_letters + string.digits) for _ in range(PASSWORD_LENGTH))
    _store_secret(password)
    _set_password(owner, password)
    _verify(password)
    _rewrite_env(text, owner, password)


if __name__ == "__main__":
    main()
