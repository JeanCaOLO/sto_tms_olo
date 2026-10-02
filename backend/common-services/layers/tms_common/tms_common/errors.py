class HttpError(Exception):
    """Error con status HTTP explícito; los handlers lo traducen a respuesta.

    `code` es opcional: el SQLSTATE de Postgres cuando el error viene de la BD
    (23503 = FK, 23505 = unicidad), para que el cliente distinga "en uso" de
    "duplicado" sin parsear el mensaje.
    """

    def __init__(self, status: int, message: str, code: str | None = None):
        super().__init__(message)
        self.status = status
        self.code = code
