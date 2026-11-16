"""Sede del almacén: depósito y región del mapa, con sus respaldos."""

from conftest import load_stack_module


def _rg():
    return load_stack_module("planning", "ruta_geo")


def _p(lat, lng):
    return {"lat": lat, "lng": lng}


def test_almacen_con_coordenadas_es_su_propio_deposito():
    s = _rg().sede_de("VN", 10.2, -68.0, [])
    assert (s.deposito, s.region, s.origen) == ((10.2, -68.0), "VN", "almacen")


def test_costa_rica_sin_coordenadas_sale_de_san_jose():
    rg = _rg()
    for pais in ("CR", "DCR", "cr"):
        s = rg.sede_de(pais, None, None, [_p(10.5, -85.0)])
        assert (s.deposito, s.region, s.origen) == (rg.DEPOT_CR, "CR", "defecto_cr")


def test_otro_pais_sin_coordenadas_sale_del_centro_de_sus_pedidos():
    s = _rg().sede_de("VN", None, None, [_p(10.0, -68.0), _p(10.4, -67.0), _p(None, None)])
    assert s.region == "VN" and s.origen == "centro_pedidos"
    assert s.deposito == (10.2, -67.5)


def test_pais_mock_de_venezuela_usa_el_mapa_de_venezuela():
    assert _rg().sede_de("DVE", None, None, [_p(10.4, -66.9)]).region == "VN"


def test_pais_sin_mapa_se_mide_en_linea_recta():
    s = _rg().sede_de("PA", 8.9, -79.5, [])
    assert s.region is None and s.origen == "almacen"


def test_lead_time_se_mide_desde_el_deposito_de_la_sede():
    rg = _rg()
    caracas = [_p(10.48, -66.90)]
    assert rg.lead_time_dias(caracas, (10.16, -68.0)) == 2          # ~125 km desde Valencia
    assert rg.lead_time_dias(caracas) > 15                          # desde San José (el error de antes)
