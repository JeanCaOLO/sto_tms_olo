"""Tokens de Google por usuario, en AWS Secrets Manager (la Lambda corre fuera de la VPC: no ve Aurora).

Un secreto por usuario del TMS: `<prefijo>/<user_id>` con `{refresh_token, email}`. El refresh token no
sale nunca de aquí: el navegador solo sabe si hay conexión y de qué cuenta de Google.
"""

import json
import os
import re
from pathlib import Path

_USER_ID = re.compile(r"^[A-Za-z0-9_-]{1,128}$")


def _client():
    import boto3  # en Lambda siempre está; se importa aquí para poder probar sin AWS
    return boto3.client("secretsmanager")


def _local_dir() -> Path | None:
    """Desarrollo local (`backend/local/serve.py`): con `GOOGLE_TOKEN_DIR` los tokens van a archivos en vez de
    Secrets Manager. Nunca se define en AWS."""
    folder = os.environ.get("GOOGLE_TOKEN_DIR")
    return Path(folder) if folder else None


def _local_file(folder: Path, user_id: str) -> Path:
    if not _USER_ID.match(user_id):
        raise ValueError("Identificador de usuario no válido")
    return folder / f"{user_id}.json"


def _name(user_id: str) -> str:
    if not _USER_ID.match(user_id):
        raise ValueError("Identificador de usuario no válido")
    return f"{os.environ['GOOGLE_TOKEN_PREFIX'].rstrip('/')}/{user_id}"


def get_connection(user_id: str) -> dict | None:
    folder = _local_dir()
    if folder:
        path = _local_file(folder, user_id)
        return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None
    client = _client()
    try:
        value = client.get_secret_value(SecretId=_name(user_id))
    except client.exceptions.ResourceNotFoundException:
        return None
    return json.loads(value["SecretString"])


def save_connection(user_id: str, connection: dict) -> None:
    folder = _local_dir()
    if folder:
        folder.mkdir(parents=True, exist_ok=True)
        _local_file(folder, user_id).write_text(json.dumps(connection), encoding="utf-8")
        return
    client = _client()
    name, payload = _name(user_id), json.dumps(connection)
    try:
        client.put_secret_value(SecretId=name, SecretString=payload)
    except client.exceptions.ResourceNotFoundException:
        client.create_secret(Name=name, SecretString=payload, Description="TMS tarifas - Google (envío de proformas)")


def delete_connection(user_id: str) -> None:
    folder = _local_dir()
    if folder:
        _local_file(folder, user_id).unlink(missing_ok=True)
        return
    client = _client()
    try:
        client.delete_secret(SecretId=_name(user_id), ForceDeleteWithoutRecovery=True)
    except client.exceptions.ResourceNotFoundException:
        pass
