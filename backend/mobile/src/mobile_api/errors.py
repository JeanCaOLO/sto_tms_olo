class HttpError(Exception):
    """Error con status HTTP explícito; el handler lo traduce a respuesta.

    `code` es opcional y legible por la app (p. ej. `token_expired`, `invalid_credentials`) o el SQLSTATE
    de Postgres cuando el error viene de la BD (23503 = FK, 23505 = unicidad).
    """

    def __init__(self, status: int, message: str, code: str | None = None):
        super().__init__(message)
        self.status = status
        self.code = code
