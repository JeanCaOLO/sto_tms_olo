class HttpError(Exception):
    """Error con status HTTP explícito; los handlers lo traducen a respuesta."""

    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
