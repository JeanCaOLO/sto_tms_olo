"""Lectura y limpieza del CSV de puntos de entrega del WMS (sin tocar la BD).

Formato: Codigo,Cliente,Zona,Ruta,Latitud,Longitud. Reglas de limpieza
(ingesta de Cofersa, 2026-09-23):
- Códigos numéricos: el WMS los usa con 9 dígitos y cero a la izquierda
  (`020308011`); el CSV los trae sin el cero (Excel). Se restaura con zfill.
- Coordenadas (0,0) = sin geocodificar -> sin coordenadas, estado PENDING.
- Coordenadas fuera de Costa Rica = basura del geocodificador -> sin
  coordenadas, estado FAILED. Nunca se guardan coordenadas inválidas.
- Ruta -> código de zona con 2 dígitos ("6" -> "06"); la Zona WMS va tal cual.
"""

import csv
from dataclasses import dataclass
from pathlib import Path

WMS_NUMERIC_CODE_LENGTH = 9
ZONE_CODE_LENGTH = 2
# Caja aproximada de Costa Rica (lat, lon).
CR_LAT = (8.0, 11.3)
CR_LON = (-86.0, -82.5)

GEO_OK = "OK"
GEO_PENDING = "PENDING"
GEO_FAILED = "FAILED"


@dataclass(frozen=True)
class DeliveryPointRow:
    code: str
    name: str
    wms_zone_code: str | None
    route_code: str | None
    zone_code: str | None
    latitude: float | None
    longitude: float | None
    geocoding_status: str


def normalize_code(raw: str) -> str:
    code = raw.strip()
    return code.zfill(WMS_NUMERIC_CODE_LENGTH) if code.isdigit() else code


def _number(raw: str) -> float | None:
    try:
        return float(raw)
    except (TypeError, ValueError):
        return None


def classify_coordinates(raw_lat: str, raw_lon: str) -> tuple[float | None, float | None, str]:
    lat, lon = _number(raw_lat), _number(raw_lon)
    if lat is None or lon is None or (lat == 0 and lon == 0):
        return None, None, GEO_PENDING
    inside = CR_LAT[0] <= lat <= CR_LAT[1] and CR_LON[0] <= lon <= CR_LON[1]
    return (lat, lon, GEO_OK) if inside else (None, None, GEO_FAILED)


def zone_code_for_route(raw_route: str) -> str | None:
    route = (raw_route or "").strip()
    return route.zfill(ZONE_CODE_LENGTH) if route.isdigit() else None


def _text_or_none(raw: str | None) -> str | None:
    value = (raw or "").strip()
    return value or None


def parse_row(record: dict) -> DeliveryPointRow:
    lat, lon, status = classify_coordinates(record.get("Latitud", ""), record.get("Longitud", ""))
    return DeliveryPointRow(
        code=normalize_code(record["Codigo"]),
        name=record["Cliente"].strip().strip('"').strip(),
        wms_zone_code=_text_or_none(record.get("Zona")),
        route_code=_text_or_none(record.get("Ruta")),
        zone_code=zone_code_for_route(record.get("Ruta", "")),
        latitude=lat,
        longitude=lon,
        geocoding_status=status,
    )


def read_rows(path: Path) -> list[DeliveryPointRow]:
    with path.open(encoding="utf-8-sig", newline="") as handle:
        parsed = [parse_row(record) for record in csv.DictReader(handle) if (record.get("Codigo") or "").strip()]
    rows = [row for row in parsed if row.name]  # un punto sin nombre no se carga (decisión 2026-09-24)
    codes = [row.code for row in rows]
    duplicated = {code for code in codes if codes.count(code) > 1}
    if duplicated:
        raise ValueError(f"Códigos repetidos tras normalizar: {sorted(duplicated)[:10]}")
    return rows
