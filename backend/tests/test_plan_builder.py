"""Agrupamiento del planificador: mayoreo por zona, tiendas EPA en viaje directo."""

from conftest import load_stack_module


def _pedido(cliente, tipo, zona=None):
    return {"customer_name": cliente, "customer_type": tipo, "delivery_zone": zona}


def test_tiendas_van_en_viaje_directo_y_mayoreo_por_zona():
    pb = load_stack_module("planning", "plan_builder")
    grupos = pb._agrupar_por_zona([
        _pedido("T005 TIBAS", "TIENDA"), _pedido("T005 TIBAS", "TIENDA"),
        _pedido("T008 CARTAGO", "TIENDA"),
        _pedido("Ferretería A", "MAYOREO", "Z1"), _pedido("Ferretería B", "MAYOREO", "Z1"),
        _pedido("Ferretería C", "MAYOREO"),
    ])
    assert {k: len(v) for k, v in grupos.items()} == {"T005 TIBAS": 2, "T008 CARTAGO": 1, "Z1": 2, "S/R": 1}
