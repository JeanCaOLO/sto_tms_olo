"""Conexiones read-only a EFLOW (SQL Server) por país, con python-tds.

Cada país es un servidor distinto con sus BDs WMH y SAP/WMS (ver
config.EFLOW_DEFAULTS). Placeholders `%(nombre)s` (paramstyle "pyformat").
"""

import pytds

from .config import EflowConfig, eflow_config

LOGIN_TIMEOUT_SECONDS = 15
QUERY_TIMEOUT_SECONDS = 25
COUNTRIES = ("cr", "ve")

_connections: dict[str, object] = {}


def normalize_country(raw: str | None) -> str:
    country = (raw or "cr").lower()
    return country if country in COUNTRIES else "cr"


def db_names(country: str) -> EflowConfig:
    return eflow_config(country)


def _connect(country: str):
    cfg = eflow_config(country)
    return pytds.connect(
        dsn=cfg.host,
        port=cfg.port,
        database=cfg.db_wmh,
        user=cfg.user,
        password=cfg.password,
        readonly=True,
        autocommit=True,
        as_dict=True,
        login_timeout=LOGIN_TIMEOUT_SECONDS,
        timeout=QUERY_TIMEOUT_SECONDS,
    )


def _run(connection, sql: str, params: dict) -> list[dict]:
    with connection.cursor() as cursor:
        cursor.execute(sql, params)
        return list(cursor.fetchall())


def query(country: str, sql: str, params: dict | None = None) -> list[dict]:
    connection = _connections.get(country)
    if connection is None:
        connection = _connections[country] = _connect(country)
    try:
        return _run(connection, sql, params or {})
    except (pytds.InterfaceError, pytds.OperationalError):
        _connections[country] = _connect(country)
        return _run(_connections[country], sql, params or {})
