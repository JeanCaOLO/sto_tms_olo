"""Acceso a Aurora del tarifador: cuenta las sentencias de cada request y fija topes de tiempo.

Envuelve `tms_common.pg` sin modificarlo (la capa común es de todos los módulos).

Topes (variables de entorno del Lambda del tarifador, en milisegundos; 0 = apagado, que es el valor
por defecto en código y en los tests):
  - `TMS_STATEMENT_TIMEOUT_MS`: una sentencia que tarde más se cancela en el servidor. Debe ser menor
    que el timeout del Lambda: así la base libera la conexión en vez de seguir trabajando para una
    request que ya murió.
  - `TMS_LOCK_TIMEOUT_MS`: cuánto espera una sentencia por un bloqueo de otra.
Se fijan por SESIÓN en la conexión de este contenedor (cada módulo tiene su propio Lambda, y por lo
tanto sus propias conexiones): no cambia la configuración de la base ni del rol, y no afecta a otros
módulos. Si la conexión se recrea, se vuelven a fijar en la siguiente sentencia.
"""

import os

from tms_common import pg
from tms_common.errors import HttpError

import tarifas_metrics

SET_LIMITS_SQL = "SELECT set_config('statement_timeout', %s, false), set_config('lock_timeout', %s, false)"
_configured: dict = {"connection": None}


def _milliseconds(name: str) -> int:
    try:
        return max(0, int(float(os.environ.get(name, "0"))))
    except ValueError:
        return 0


def reset_session() -> None:
    _configured["connection"] = None


def _ensure_limits() -> None:
    statement, lock = _milliseconds("TMS_STATEMENT_TIMEOUT_MS"), _milliseconds("TMS_LOCK_TIMEOUT_MS")
    if statement <= 0 and lock <= 0:
        return
    try:
        connection = pg._live_connection()
        if _configured["connection"] is connection:
            return
        pg._run(connection, SET_LIMITS_SQL, [str(statement), str(lock)])
        _configured["connection"] = connection
    except Exception:
        # Sin conexión todavía: la sentencia real la recrea y el tope se fija en la siguiente.
        _configured["connection"] = None


def _slow(err: HttpError) -> HttpError:
    message = str(err)
    if "statement timeout" in message or "lock timeout" in message:
        return HttpError(504, "La consulta tardó demasiado y se canceló. Probá con un filtro más acotado.")
    return err


def query(sql: str, params: list | tuple = ()) -> list[dict]:
    _ensure_limits()
    tarifas_metrics.count_query()
    try:
        return pg.query(sql, params)
    except HttpError as err:
        raise _slow(err) from err


def run_in_transaction(work, retries: int = 0):
    """`pg.run_in_transaction` contando cada sentencia de la transacción."""
    _ensure_limits()

    def counted(run):
        def counting(sql, params=()):
            tarifas_metrics.count_query()
            return run(sql, params)

        return work(counting)

    try:
        return pg.run_in_transaction(counted, retries=retries)
    except HttpError as err:
        raise _slow(err) from err
