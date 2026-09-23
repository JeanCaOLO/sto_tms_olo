import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "local"))

from delivery_points_csv import (GEO_FAILED, GEO_OK, GEO_PENDING, classify_coordinates,  # noqa: E402
                                 normalize_code, parse_row, read_rows, zone_code_for_route)


@pytest.mark.parametrize("raw, expected", [
    ("20308011", "020308011"),   # el CSV perdió el cero del WMS
    ("020308011", "020308011"),
    (" A7074 ", "A7074"),         # alfanumérico: tal cual
    ("EM1040", "EM1040"),
])
def test_normalize_code_restores_wms_leading_zero(raw, expected):
    assert normalize_code(raw) == expected


def test_coordinates_classification():
    assert classify_coordinates("9.66", "-84.02") == (9.66, -84.02, GEO_OK)
    assert classify_coordinates("0", "0") == (None, None, GEO_PENDING)
    assert classify_coordinates("", "x") == (None, None, GEO_PENDING)
    assert classify_coordinates("51.51", "-0.07") == (None, None, GEO_FAILED)   # Londres
    assert classify_coordinates("9.0", "-79.5") == (None, None, GEO_FAILED)     # Panamá


@pytest.mark.parametrize("raw, expected", [("6", "06"), ("16", "16"), ("39", "39"), ("", None), ("ND", None)])
def test_route_to_zone_code(raw, expected):
    assert zone_code_for_route(raw) == expected


def test_parse_row_cleans_name_and_keeps_raw_zone():
    row = parse_row({"Codigo": "20209009", "Cliente": ' "AGROLAND DEL PACIFICO S.A"', "Zona": "Z186",
                     "Ruta": "13", "Latitud": "9.87", "Longitud": "-84.58"})
    assert (row.code, row.name, row.wms_zone_code, row.route_code, row.zone_code) == (
        "020209009", "AGROLAND DEL PACIFICO S.A", "Z186", "13", "13")
    assert row.geocoding_status == GEO_OK


def test_read_rows_rejects_codes_duplicated_after_normalizing(tmp_path):
    csv_file = tmp_path / "puntos.csv"
    csv_file.write_text("Codigo,Cliente,Zona,Ruta,Latitud,Longitud\n20308011,A,Z1,1,0,0\n020308011,B,Z1,1,0,0\n",
                        encoding="utf-8")
    with pytest.raises(ValueError, match="repetidos"):
        read_rows(csv_file)
