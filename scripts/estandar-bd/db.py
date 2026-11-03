"""Conexión a tms_olo leyendo .env.local (TMS_DB_*). Nunca imprime credenciales."""

from pathlib import Path

import psycopg2

ROOT = Path(__file__).resolve().parents[2]


def env() -> dict[str, str]:
    vals: dict[str, str] = {}
    for line in (ROOT / ".env.local").read_text(encoding="utf-8", errors="replace").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            vals[k.strip()] = v.strip().strip('"').strip("'")
    return vals


def connect(admin: bool = True, app_name: str = "estandar-bd"):
    e = env()
    user = (e.get("TMS_DB_ADMIN_USER") if admin else None) or e["TMS_DB_USER"]
    pwd = (e.get("TMS_DB_ADMIN_PASSWORD") if admin else None) or e["TMS_DB_PASSWORD"]
    return psycopg2.connect(
        host=e.get("TMS_DB_HOST", "localhost"), port=int(e.get("TMS_DB_PORT", "5432")),
        dbname=e.get("TMS_DB_NAME", "tms_olo"), user=user, password=pwd,
        sslmode="require", application_name=app_name, connect_timeout=15,
    )
