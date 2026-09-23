"""Acceso a Aurora PostgreSQL (tms_olo) con pg8000 (Python puro, sin binarios).

Placeholders estilo `%s` (paramstyle "format"). Una conexión por contenedor
Lambda, reutilizada entre invocaciones; si se cayó, se reconecta una vez.
"""

import ssl
from contextlib import contextmanager
from typing import Callable, Iterator

import pg8000.dbapi

from .config import db_config
from .errors import HttpError

SOCKET_TIMEOUT_SECONDS = 25

_connection = None


def _ssl_context() -> ssl.SSLContext:
    # Paridad con server/tms-db.mjs (rejectUnauthorized: false). Pendiente:
    # validar contra el bundle CA de RDS.
    context = ssl.create_default_context()
    context.check_hostname = False
    context.verify_mode = ssl.CERT_NONE
    return context


def _connect():
    cfg = db_config()
    connection = pg8000.dbapi.connect(
        host=cfg["host"],
        port=int(cfg.get("port") or 5432),
        user=cfg["username"],
        password=cfg["password"],
        database=cfg.get("dbname") or "tms_olo",
        ssl_context=_ssl_context(),
        timeout=SOCKET_TIMEOUT_SECONDS,
    )
    connection.autocommit = True
    return connection


def _run(connection, sql: str, params: list) -> list[dict]:
    cursor = connection.cursor()
    try:
        cursor.execute(sql, params)
        if cursor.description is None:
            return []
        columns = [column[0] for column in cursor.description]
        return [dict(zip(columns, row)) for row in cursor.fetchall()]
    finally:
        cursor.close()


INTEGRITY_CLASS = "23"  # SQLSTATE 23xxx: FK, unique, not null, check


def _database_error(err: pg8000.dbapi.DatabaseError) -> HttpError:
    detail = err.args[0] if err.args else None
    if not isinstance(detail, dict):
        return HttpError(500, str(err))
    status = 409 if str(detail.get("C", "")).startswith(INTEGRITY_CLASS) else 500
    return HttpError(status, detail.get("M", str(err)))


def _live_connection():
    global _connection
    if _connection is None:
        _connection = _connect()
    return _connection


def query(sql: str, params: list | tuple = ()) -> list[dict]:
    global _connection
    try:
        return _run(_live_connection(), sql, list(params))
    except pg8000.dbapi.InterfaceError:
        _connection = _connect()
        return _run(_connection, sql, list(params))
    except pg8000.dbapi.DatabaseError as err:
        # Mismo comportamiento que el Express: el mensaje de Postgres (FK,
        # unique, etc.) llega al frontend para que pueda mostrarlo.
        raise _database_error(err) from err


Runner = Callable[[str, list | tuple], list[dict]]


@contextmanager
def transaction() -> Iterator[Runner]:
    """Varias sentencias atómicas: COMMIT si el bloque termina bien, ROLLBACK si lanza."""
    connection = _live_connection()
    _run(connection, "BEGIN", [])
    try:
        yield lambda sql, params=(): _run(connection, sql, list(params))
        _run(connection, "COMMIT", [])
    except pg8000.dbapi.DatabaseError as err:
        _run(connection, "ROLLBACK", [])
        raise _database_error(err) from err
    except BaseException:
        _run(connection, "ROLLBACK", [])
        raise
