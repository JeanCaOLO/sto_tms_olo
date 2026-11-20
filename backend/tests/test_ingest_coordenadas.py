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
