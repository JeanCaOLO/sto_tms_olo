"""Fuente EFLOW real: SELECT parametrizados contra el SQL Server del país."""

from tms_common import eflow_db
from tms_common.errors import HttpError

import eflow_queries as q


def _names(country: str):
    return eflow_db.db_names(country)


def health(country: str) -> dict:
    rows = eflow_db.query(country, "SELECT 1 AS ok")
    return {"ok": rows[0]["ok"] == 1, "pais": country}


def trips(country: str, limit: int) -> list[dict]:
    names = _names(country)
    return eflow_db.query(country, q.list_trips(names.db_wmh, names.db_sap), {"limit": limit})


def trip(country: str, trip_id: int) -> dict | None:
    names = _names(country)
    rows = eflow_db.query(country, q.get_trip(names.db_wmh, names.db_sap), {"id": trip_id})
    return rows[0] if rows else None


def trip_orders(country: str, trip_id: int) -> list[dict]:
    names = _names(country)
    return eflow_db.query(country, q.list_trip_orders(names.db_wmh, names.db_sap), {"trip_id": trip_id})


def routes(country: str) -> list[dict]:
    return eflow_db.query(country, q.list_routes(_names(country).db_wmh))


def carriers(country: str) -> list[dict]:
    return eflow_db.query(country, q.list_carriers(_names(country).db_wmh))


def drivers(country: str, carrier_id: int | None) -> list[dict]:
    return eflow_db.query(country, q.list_drivers(_names(country).db_wmh), {"carrier_id": carrier_id})


def vehicles(country: str, carrier_id: int | None) -> list[dict]:
    return eflow_db.query(country, q.list_vehicles(_names(country).db_wmh), {"carrier_id": carrier_id})


def route_days(_country: str) -> list[dict]:
    # Vive solo en el repo TMS-Backend; falta portar su SQL (RUTA_DIA_AB).
    raise HttpError(501, "rutas_dias_not_ported")
