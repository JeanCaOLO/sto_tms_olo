"""Cache de secretos por contenedor Lambda (warm start)."""

from __future__ import annotations

import json
from typing import Any

_cache: dict[str, Any] = {}


def secret_json(name: str) -> Any:
    """Resuelve un secreto JSON de Secrets Manager una vez por contenedor."""
    if name not in _cache:
        import boto3  # en el runtime de Lambda; import tardío para tests locales

        client = boto3.client("secretsmanager")
        raw = client.get_secret_value(SecretId=name)["SecretString"]
        _cache[name] = json.loads(raw)
    return _cache[name]
