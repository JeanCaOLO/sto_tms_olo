"""Corre el BARRIDO del OMS localmente contra Aurora (sandbox) por el túnel SSM.

Para probar el motor en vivo SIN desplegar y SIN pasar por HTTP/JWT: usa el mismo
`app.correr()` que dispara la Lambda. Lee `.env.local`/`.env` (TMS_DB_* →
localhost:15432) y, al no haber TMS_DB_SECRET_NAME local, `tms_common.config`
cae a esas variables. Se conecta con el rol de la app (TMS_DB_USER), que ya tiene
los grants.

OJO: en modo live ESCRIBE en el Aurora real del sandbox (prioriza/libera los 402
pedidos y escribe en oms_logs). Es la misma base que ve la UI.

Requisitos:
  1. Túnel SSM activo (localhost:15432).
  2. pip install pg8000   (driver de Postgres que usa el Layer; no viene local).

Uso:
  python backend/oms/run_local.py            # OMS_SOURCE=live por defecto acá
  OMS_SOURCE=mock python backend/oms/run_local.py   # sin tocar la BD (datos fijos)
"""

import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend" / "common-services" / "layers" / "tms_common"))
sys.path.insert(0, str(ROOT / "backend" / "oms" / "src"))

# Carga .env.local y .env (setdefault: el primero gana; .env trae TMS_DB_* del túnel).
for name in (".env.local", ".env"):
    path = ROOT / name
    if not path.exists():
        continue
    for line in path.read_text(encoding="utf-8").splitlines():
        key, sep, value = line.partition("=")
        if sep and not key.strip().startswith("#"):
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))

# Local: forzar el camino TMS_DB_* (no el secreto de Secrets Manager de la Lambda).
os.environ.pop("TMS_DB_SECRET_NAME", None)
os.environ.setdefault("OMS_SOURCE", "live")

import app  # noqa: E402 — tras armar sys.path

if __name__ == "__main__":
    print(f"OMS_SOURCE={os.environ['OMS_SOURCE']}  host={os.environ.get('TMS_DB_HOST')}:{os.environ.get('TMS_DB_PORT')}")
    print(json.dumps(app.correr(), default=str, indent=2, ensure_ascii=False))
