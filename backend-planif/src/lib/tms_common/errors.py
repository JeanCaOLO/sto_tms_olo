"""Error con status HTTP explícito; los handlers lo traducen a respuesta."""

from __future__ import annotations


class HttpError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
