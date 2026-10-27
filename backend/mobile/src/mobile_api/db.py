"""Acceso a Aurora PostgreSQL (BD compartida con el TMS) con pg8000. Placeholders `%s`.

Una conexión por contenedor Lambda, reutilizada entre invocaciones; si se cayó, se reconecta una vez.
"""

import os
import ssl
import time
from contextlib import contextmanager
from typing import Callable, Iterator, TypeVar

import pg8000.dbapi

from .config import db_config
from .errors import HttpError

# Menor que el timeout de la Lambda (20 s): una consulta colgada falla con error propio, no con la Lambda cortada.
SOCKET_TIMEOUT_SECONDS = 15
APPLICATION_NAME = "tms-mobile-api"

_connection = None


def _ssl_context() -> ssl.SSLContext:
    ca_file = os.environ.get("DB_SSL_CA")
    if ca_file:
        return ssl.create_default_context(cafile=ca_file)
    context = ssl.create_default_context()
    context.check_hostname = False
    context.verify_mode = ssl.CERT_NONE
    return context


def connect(cfg: dict | None = None, *, autocommit: bool = True):
    cfg = cfg or db_config()
    connection = pg8000.dbapi.connect(
        host=cfg["host"], port=int(cfg.get("port") or 5432), user=cfg["username"], password=cfg["password"],
        database=cfg.get("dbname") or "tms_olo", ssl_context=_ssl_context(), timeout=SOCKET_TIMEOUT_SECONDS,
        application_name=APPLICATION_NAME)
    connection.autocommit = autocommit
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


INTEGRITY_CLASS = "23"
RETRYABLE_SQLSTATES = {"40P01", "40001"}  # deadlock / fallo de serialización


def _database_error(err: pg8000.dbapi.DatabaseError) -> HttpError:
    detail = err.args[0] if err.args else None
    if not isinstance(detail, dict):
        return HttpError(500, str(err))
    sqlstate = str(detail.get("C", ""))
    if sqlstate.startswith(INTEGRITY_CLASS):
        return HttpError(409, detail.get("M", str(err)), code=sqlstate)
    return HttpError(500, detail.get("M", str(err)), code=sqlstate if sqlstate in RETRYABLE_SQLSTATES else None)


def _live_connection():
    global _connection
    if _connection is None:
        _connection = connect()
    return _connection


def query(sql: str, params: list | tuple = ()) -> list[dict]:
    global _connection
    try:
        return _run(_live_connection(), sql, list(params))
    except pg8000.dbapi.InterfaceError:
        _connection = connect()
        return _run(_connection, sql, list(params))
    except pg8000.dbapi.DatabaseError as err:
        raise _database_error(err) from err


Runner = Callable[[str, list | tuple], list[dict]]


@contextmanager
def transaction() -> Iterator[Runner]:
    """Varias sentencias atómicas: COMMIT si el bloque termina bien, ROLLBACK si lanza.

    Si la conexión reutilizada llegó muerta, se reconecta al abrir (aún no se escribió nada). Si muere a mitad, se
    descarta para que la próxima petición abra una nueva; el servidor ya hizo rollback de lo pendiente.
    """
    global _connection
    try:
        connection = _live_connection()
        _run(connection, "BEGIN", [])
    except pg8000.dbapi.InterfaceError:
        connection = _connection = connect()
        _run(connection, "BEGIN", [])
    try:
        yield lambda sql, params=(): _run(connection, sql, list(params))
        _run(connection, "COMMIT", [])
    except pg8000.dbapi.InterfaceError:
        _connection = None
        raise HttpError(503, "Se perdió la conexión con la base de datos. Reintenta.") from None
    except pg8000.dbapi.DatabaseError as err:
        _run(connection, "ROLLBACK", [])
        raise _database_error(err) from err
    except BaseException:
        _run(connection, "ROLLBACK", [])
        raise


T = TypeVar("T")

# Actor de auditoría de la request en curso (JSON). Se fija con `set_config(..., true)`, LOCAL a la transacción: el
# trigger del TMS lo lee y desaparece solo con el COMMIT/ROLLBACK, sin un viaje extra para limpiarlo ni riesgo de
# que quede pegado a la conexión reutilizada.
SET_LOCAL_ACTOR_SQL = "SELECT set_config('tms.audit_actor', %s, true)"
_actor: str | None = None


def bind_actor(value: str | None) -> None:
    global _actor
    _actor = value


def run_in_transaction(work: Callable[[Runner], T], retries: int = 0) -> T:
    """`transaction()` que repite `work` ante un deadlock o fallo de serialización (solo bloques repetibles)."""
    attempt = 0
    while True:
        try:
            with transaction() as run:
                if _actor:
                    run(SET_LOCAL_ACTOR_SQL, [_actor])
                return work(run)
        except HttpError as err:
            if err.code not in RETRYABLE_SQLSTATES or attempt >= retries:
                raise
            attempt += 1
            time.sleep(0.1 * attempt)
