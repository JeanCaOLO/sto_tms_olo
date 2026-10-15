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


def test_read_rows_skips_points_without_name(tmp_path):
    csv_file = tmp_path / "puntos.csv"
    csv_file.write_text('Codigo,Cliente,Zona,Ruta,Latitud,Longitud\nCO0190," ",Z190,21,0,0\nCO0191,FERRETERIA,Z1,1,0,0\n',
                        encoding="utf-8")
    assert [row.code for row in read_rows(csv_file)] == ["CO0191"]


def test_coordinates_use_the_customer_country_box():
    assert classify_coordinates("10.48", "-66.90", "VN") == (10.48, -66.90, GEO_OK)      # Caracas
    assert classify_coordinates("10.48", "-66.90") == (None, None, GEO_FAILED)           # fuera de CR
    assert classify_coordinates("9.66", "-84.02", "VN") == (None, None, GEO_FAILED)      # CR, fuera de VE


def test_read_rows_clean_format_keeps_address_status_and_active(tmp_path):
    csv_file = tmp_path / "ve.csv"
    csv_file.write_text(
        "codigo,nombre,direccion,latitud,longitud,geocoding_status,geo_note,activo\n"
        '01-01-003,"FERRETERIA CASA BLANCA 80, C.A.","CARACAS, CALLE DEMOCRACIA",10.48,-66.90,OK,,S\n'
        "01-01-004,SIN COORDS,,,,PENDING,sin-coords,S\n"
        "01-01-005,ROTA,X,10.5,-6694653,FAILED,fuera-de-VE,N\n"
        "01-01-006,FUERA,X,9.66,-84.02,OK,,S\n",
        encoding="utf-8")
    rows = {row.code: row for row in read_rows(csv_file, "VN")}
    ok = rows["01-01-003"]
    assert (ok.name, ok.address_line, ok.latitude, ok.longitude, ok.geocoding_status, ok.active) == (
        "FERRETERIA CASA BLANCA 80, C.A.", "CARACAS, CALLE DEMOCRACIA", 10.48, -66.90, GEO_OK, True)
    assert (ok.route_code, ok.zone_code, ok.wms_zone_code) == (None, None, None)
    assert (rows["01-01-004"].geocoding_status, rows["01-01-004"].latitude, rows["01-01-004"].address_line) == (
        GEO_PENDING, None, None)
    assert (rows["01-01-005"].geocoding_status, rows["01-01-005"].latitude, rows["01-01-005"].active) == (
        GEO_FAILED, None, False)
    assert (rows["01-01-006"].geocoding_status, rows["01-01-006"].latitude) == (GEO_FAILED, None)
