"""HTTP saliente con la biblioteca estándar (la Lambda no lleva dependencias). Se aísla en un módulo
para que las pruebas lo reemplacen sin tocar la red."""

import json
import urllib.error
import urllib.parse
import urllib.request

TIMEOUT_SECONDS = 15


class UpstreamError(Exception):
    """Google respondió con error o no respondió. `status` es el HTTP (0 = sin respuesta)."""

    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status


def _send(request: urllib.request.Request) -> dict:
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            raw = response.read()
    except urllib.error.HTTPError as err:
        detail = err.read().decode("utf-8", "replace")[:300]
        raise UpstreamError(err.code, f"Google respondió {err.code}: {detail}") from err
    except (urllib.error.URLError, TimeoutError) as err:
        raise UpstreamError(0, f"No se pudo contactar a Google: {err}") from err
    return json.loads(raw) if raw else {}


def post_form(url: str, data: dict) -> dict:
    body = urllib.parse.urlencode(data).encode("utf-8")
    request = urllib.request.Request(url, data=body, method="POST",
                                     headers={"Content-Type": "application/x-www-form-urlencoded"})
    return _send(request)


def post_json(url: str, payload: dict, bearer: str) -> dict:
    request = urllib.request.Request(
        url, data=json.dumps(payload).encode("utf-8"), method="POST",
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {bearer}"})
    return _send(request)


def get_json(url: str, bearer: str) -> dict:
    return _send(urllib.request.Request(url, headers={"Authorization": f"Bearer {bearer}"}))
