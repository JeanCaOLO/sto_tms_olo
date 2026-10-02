import json
from typing import Any

# Cache de warm start: se va a Secrets Manager una vez por contenedor.
_cache: dict[str, Any] = {}


def secret_json(name: str) -> Any:
    if name not in _cache:
        import boto3  # incluido en el runtime de Lambda; import tardío para tests locales

        client = boto3.client("secretsmanager")
        raw = client.get_secret_value(SecretId=name)["SecretString"]
        _cache[name] = json.loads(raw)
    return _cache[name]
