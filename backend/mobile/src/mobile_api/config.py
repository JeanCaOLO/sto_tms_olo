"""Configuración. En AWS cada valor sale de Secrets Manager (la Lambda solo recibe el NOMBRE del secreto);
sin esa variable se usan variables de entorno planas (desarrollo local, ver ../.env.example)."""

import json
import os
from typing import Any

_cache: dict[str, Any] = {}


def secret_json(name: str) -> Any:
    if name not in _cache:
        import boto3  # incluido en el runtime de Lambda; import tardío para correr los tests sin AWS

        raw = boto3.client("secretsmanager").get_secret_value(SecretId=name)["SecretString"]
        _cache[name] = json.loads(raw)
    return _cache[name]


def db_config() -> dict:
    """Formato estándar de RDS: host, port, username, password, dbname."""
    name = os.environ.get("DB_SECRET_NAME")
    if name:
        return secret_json(name)
    return {"host": os.environ.get("DB_HOST", "localhost"), "port": os.environ.get("DB_PORT", 5432),
            "username": os.environ.get("DB_USER"), "password": os.environ.get("DB_PASSWORD"),
            "dbname": os.environ.get("DB_NAME", "tms_olo")}


def admin_db_config() -> dict:
    """Dueño de las tablas, solo para migraciones (DDL). Sin DB_ADMIN_* cae al usuario de la app."""
    base = db_config()
    return {**base, "username": os.environ.get("DB_ADMIN_USER") or base["username"],
            "password": os.environ.get("DB_ADMIN_PASSWORD") or base["password"]}


def jwt_secret() -> str:
    """Secreto PROPIO de la app móvil (distinto al del TMS: un token de uno no sirve en el otro)."""
    name = os.environ.get("JWT_SECRET_NAME")
    value = secret_json(name)["jwt_secret"] if name else os.environ.get("JWT_SECRET")
    if not value:
        raise RuntimeError("Falta el secreto JWT (JWT_SECRET_NAME o JWT_SECRET)")
    return value


def evidence_bucket() -> str:
    return os.environ["EVIDENCE_BUCKET"]


def evidence_bucket_or_none() -> str | None:
    """Bucket que se anota en la fila; en desarrollo local sin S3 (local/dev_evidence.py) no hay."""
    return os.environ.get("EVIDENCE_BUCKET") or None


def driver_role_name() -> str:
    return os.environ.get("DRIVER_ROLE_NAME", "Chofer")
