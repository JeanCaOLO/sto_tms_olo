"""Configuración de conexiones.

En AWS cada valor sale de Secrets Manager (la Lambda solo recibe el NOMBRE del
secreto por env var). Si la env var del secreto no está, se cae a las mismas
variables de `.env.local` que usaba `server/` — así se puede correr local.
"""

import os
from dataclasses import dataclass

from .secrets import secret_json

DEFAULT_PG_PORT = 5432
EFLOW_DEFAULTS = {
    "cr": {"port": 1433, "db_wmh": "EFLOW_WMH", "db_sap": "EFLOW_OLO"},
    "ve": {"port": 1446, "db_wmh": "WMH", "db_sap": "EFLOW_FEBECA"},
}


@dataclass(frozen=True)
class EflowConfig:
    host: str
    port: int
    user: str
    password: str
    db_wmh: str
    db_sap: str


def db_config() -> dict:
    """Secreto con el formato estándar de RDS: host, port, username, password, dbname."""
    name = os.environ.get("TMS_DB_SECRET_NAME")
    if name:
        return secret_json(name)
    return {
        "host": os.environ.get("TMS_DB_HOST", "localhost"),
        "port": os.environ.get("TMS_DB_PORT", DEFAULT_PG_PORT),
        "username": os.environ.get("TMS_DB_USER"),
        "password": os.environ.get("TMS_DB_PASSWORD"),
        "dbname": os.environ.get("TMS_DB_NAME", "tms_olo"),
    }


def jwt_secret() -> str:
    name = os.environ.get("JWT_SECRET_NAME")
    value = secret_json(name)["jwt_secret"] if name else os.environ.get("JWT_SECRET")
    if not value:
        raise RuntimeError("Falta el secreto JWT (JWT_SECRET_NAME o JWT_SECRET)")
    return value


def _eflow_from_env(country: str) -> dict | None:
    prefix = f"EFLOW_{country.upper()}_"
    if not os.environ.get(prefix + "HOST") and country == "cr" and os.environ.get("EFLOW_QA_HOST"):
        prefix = "EFLOW_QA_"  # compat con las variables viejas, igual que server/db.mjs
    raw = {key: os.environ.get(prefix + key.upper()) for key in ("host", "port", "user", "password", "db_wmh", "db_sap")}
    return raw if raw["host"] and raw["user"] and raw["password"] else None


def eflow_config(country: str) -> EflowConfig:
    name = os.environ.get("EFLOW_SECRET_NAME")
    raw = secret_json(name).get(country) if name else _eflow_from_env(country)
    if not raw:
        raise RuntimeError(f'Sin credenciales EFLOW para país "{country}"')
    defaults = EFLOW_DEFAULTS[country]
    return EflowConfig(
        host=raw["host"],
        port=int(raw.get("port") or defaults["port"]),
        user=raw["user"],
        password=raw["password"],
        db_wmh=raw.get("db_wmh") or defaults["db_wmh"],
        db_sap=raw.get("db_sap") or defaults["db_sap"],
    )
