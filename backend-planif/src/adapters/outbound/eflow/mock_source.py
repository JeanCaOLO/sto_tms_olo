"""Fuente EFLOW simulada (EFLOW_MODE=mock), mientras no haya red hacia los SQL
Server de EFLOW desde AWS.

Implementa `ports.EflowSource` con las mismas formas de fila que `LiveEflowSource`.
Los datos (mock_data.json, junto a este archivo) salen de los fallbacks del
frontend: catálogo real de EFLOW QA más paradas sintéticas en la GAM. El mismo
dataset sirve para cualquier país. Portado de `origin/main:backend/eflow/mock_source.py`.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path

DATA_FILE = Path(__file__).with_name("mock_data.json")


@lru_cache(maxsize=1)
def _data() -> dict:
    return json.loads(DATA_FILE.read_text(encoding="utf-8"))


def _by_id(rows: list[dict], key: str) -> dict:
    return {row[key]: row for row in rows}


def _trip_row(trip: dict) -> dict:
    data = _data()
    orders = [o for o in data["orders"] if o["trip_id"] == trip["trip_id"]]
    route = _by_id(data["routes"], "route_code").get(trip["route_code"], {})
    driver = _by_id(data["drivers"], "driver_id").get(trip["driver_id"]) or {}
    vehicle = _by_id(data["vehicles"], "vehicle_id").get(trip["vehicle_id"]) or {}
    carrier = _by_id(data["carriers"], "carrier_id").get(driver.get("carrier_id")) or {}
    today = datetime.now(timezone.utc).replace(hour=12, minute=0, second=0, microsecond=0)
    return {
        "trip_id": trip["trip_id"], "trip_status": "PENDING", "trip_created": today,
        "trip_dispatch": None, "trip_closed": None, "dock": trip["dock"],
        "route_codes": trip["route_code"], "route_name": route.get("route_name"),
        "route_alias": route.get("route_alias"), "driver_id": driver.get("driver_id"),
        "driver_name": driver.get("driver_name"), "driver_document": driver.get("driver_document"),
        "driver_phone": driver.get("driver_phone"), "carrier_name": carrier.get("company_name"),
        "vehicle_id": vehicle.get("vehicle_id"), "vehicle_plate": vehicle.get("license_plate"),
        "vehicle_brand": vehicle.get("vehicle_brand"), "vehicle_weight_capacity": 0,
        "vehicle_volumetric_capacity": 0, "customer_count": len(orders),
        "total_weight": round(sum(o["total_weight"] for o in orders), 2),
        "total_volume": round(sum(o["total_volume"] for o in orders), 2),
    }


class MockEflowSource:
    """Implementa `ports.EflowSource` con datos fijos (sin red a EFLOW)."""

    def health(self, country: str) -> dict:
        return {"ok": True, "pais": country, "mode": "mock"}

    def trips(self, _country: str, limit: int) -> list[dict]:
        ordered = sorted(_data()["trips"], key=lambda t: t["trip_id"], reverse=True)
        return [_trip_row(t) for t in ordered[:limit]]

    def trip(self, _country: str, trip_id: int) -> dict | None:
        match = _by_id(_data()["trips"], "trip_id").get(trip_id)
        return _trip_row(match) if match else None

    def trip_orders(self, _country: str, trip_id: int) -> list[dict]:
        return [o for o in _data()["orders"] if o["trip_id"] == trip_id]

    def routes(self, _country: str) -> list[dict]:
        return _data()["routes"]

    def carriers(self, _country: str) -> list[dict]:
        return sorted(_data()["carriers"], key=lambda c: c["company_name"])

    @staticmethod
    def _by_carrier(rows: list[dict], carrier_id: int | None) -> list[dict]:
        return [r for r in rows if carrier_id is None or r["carrier_id"] == carrier_id]

    def drivers(self, _country: str, carrier_id: int | None) -> list[dict]:
        return self._by_carrier(_data()["drivers"], carrier_id)

    def vehicles(self, _country: str, carrier_id: int | None) -> list[dict]:
        return self._by_carrier(_data()["vehicles"], carrier_id)

    def route_days(self, _country: str) -> list[dict]:
        return _data()["route_days"]
