"""Coordenadas de eFlow: fuera de rango se descartan para no romper la ingesta."""

import pytest
from conftest import load_stack_module


@pytest.mark.parametrize("valor, limite, esperado", [
    ("-83.943225", 180, -83.943225),
    ("9.93", 90, 9.93),
    ("-83943225", 180, None),   # caso real de eFlow: sin punto decimal
    ("95", 90, None),
    (0, 180, None),
    (None, 90, None),
    ("abc", 90, None),
])
def test_coord(valor, limite, esperado):
    ing = load_stack_module("planning", "ingest_orders")
    assert ing._coord(valor, limite) == esperado


def test_sin_coordenadas_de_eflow_usa_el_punto_de_entrega_de_aurora():
    io = load_stack_module("planning", "ingest_orders")
    punto = (9.0793621, -83.6618421, "Golfito")
    fila = {"LATITUD": None, "LONGITUD": None, "DIRECCIONLARGA": None}
    assert io._completar_ubicacion(fila, punto) == ("Golfito", 9.0793621, -83.6618421)
    # Coordenada de eFlow válida: gana eFlow.
    fila = {"LATITUD": "10.28", "LONGITUD": "-84.95", "DIRECCIONLARGA": "Las Juntas"}
    assert io._completar_ubicacion(fila, punto) == ("Las Juntas", 10.28, -84.95)
    # Coordenada de eFlow fuera de rango y cliente sin punto en Aurora: queda sin coordenadas.
    fila = {"LATITUD": "10.28", "LONGITUD": "-83943225", "DIRECCIONLARGA": "X"}
    assert io._completar_ubicacion(fila, None) == ("X", 10.28, None)
