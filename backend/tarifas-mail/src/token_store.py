"""Tokens de Google por usuario, en AWS Secrets Manager (la Lambda corre fuera de la VPC: no ve Aurora).

Un secreto por usuario del TMS: `<prefijo>/<user_id>` con `{refresh_token, email}`. El refresh token no
sale nunca de aquí: el navegador solo sabe si hay conexión y de qué cuenta de Google.
"""

import json
import os
import re

_USER_ID = re.compile(r"^[A-Za-z0-9_-]{1,128}$")


def _client():
    import boto3  # en Lambda siempre está; se importa aquí para poder probar sin AWS
    return boto3.client("secretsmanager")


def _name(user_id: str) -> str:
    if not _USER_ID.match(user_id):
        raise ValueError("Identificador de usuario no válido")
    return f"{os.environ['GOOGLE_TOKEN_PREFIX'].rstrip('/')}/{user_id}"


def get_connection(user_id: str) -> dict | None:
    client = _client()
    try:
        value = client.get_secret_value(SecretId=_name(user_id))
    except client.exceptions.ResourceNotFoundException:
        return None
    return json.loads(value["SecretString"])


def save_connection(user_id: str, connection: dict) -> None:
    client = _client()
    name, payload = _name(user_id), json.dumps(connection)
    try:
        client.put_secret_value(SecretId=name, SecretString=payload)
    except client.exceptions.ResourceNotFoundException:
        client.create_secret(Name=name, SecretString=payload, Description="TMS tarifas - Google (envío de proformas)")


def delete_connection(user_id: str) -> None:
    client = _client()
    try:
        client.delete_secret(SecretId=_name(user_id), ForceDeleteWithoutRecovery=True)
    except client.exceptions.ResourceNotFoundException:
        pass
