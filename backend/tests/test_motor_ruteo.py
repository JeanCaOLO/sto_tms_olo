"""Contrato del motor de ruteo (`asignar_y_ordenar`): fija el comportamiento de la
heurística actual para que un motor nuevo (solver) se compare contra esto."""

from conftest import load_stack_module

DEPOT = (9.9281, -84.0907)  # ruta_geo.DEPOT_CR


def _motor():
    return load_stack_module("planning", "motor_ruteo")


def _pedido(pid, zona="Z1", peso=100.0, vol=1.0, lat=None, lng=None, cliente="Ferretería", tipo="MAYOREO"):
    return {"id": pid, "delivery_zone": zona, "weight": peso, "volume": vol, "lat": lat, "lng": lng,
            "customer_name": cliente, "customer_type": tipo}


def _camion(vid, cw=1000.0, cv=10.0):
    return {"id": vid, "plate": f"P-{vid}", "cw": cw, "cv": cv}


def _ids(viaje):
    return [o["id"] for o in viaje["pedidos"]]


def test_sin_pedidos_no_hay_viajes():
    assert _motor().asignar_y_ordenar([], [_camion("A")]) == []


def test_tiendas_van_en_viaje_directo_y_mayoreo_por_zona():
    grupos = _motor().agrupar_por_zona([
        _pedido(1, None, cliente="T005 TIBAS", tipo="TIENDA"), _pedido(2, None, cliente="T005 TIBAS", tipo="TIENDA"),
        _pedido(3, None, cliente="T008 CARTAGO", tipo="TIENDA"),
        _pedido(4, "Z1"), _pedido(5, "Z1"), _pedido(6, None),
    ])
    assert {k: len(v) for k, v in grupos.items()} == {"T005 TIBAS": 2, "T008 CARTAGO": 1, "Z1": 2, "S/R": 1}


def test_parte_el_viaje_al_superar_el_margen_de_peso():
    # Camión de 1000 kg → tope 850 kg: entran 8 pedidos de 100 kg, el noveno abre otro viaje.
    viajes = _motor().asignar_y_ordenar([_pedido(i) for i in range(9)], [_camion("A", cv=1000.0)])
    assert [len(v["pedidos"]) for v in viajes] == [8, 1]
    assert [v["peso"] for v in viajes] == [800.0, 100.0]


def test_parte_el_viaje_al_superar_el_margen_de_volumen():
    # 10 m³ → tope 9,5 m³: entran 9 pedidos de 1 m³.
    viajes = _motor().asignar_y_ordenar([_pedido(i, peso=1.0) for i in range(10)], [_camion("A")])
    assert [len(v["pedidos"]) for v in viajes] == [9, 1]


def test_tope_de_paradas_por_viaje():
    m = _motor()
    viajes = m.asignar_y_ordenar([_pedido(i, peso=1.0, vol=0.01) for i in range(m.MAX_PARADAS + 1)], [_camion("A")])
    assert [len(v["pedidos"]) for v in viajes] == [m.MAX_PARADAS, 1]


def test_un_pedido_que_excede_el_camion_va_solo():
    # Primero se llena con lo que cabe; el que excede cualquier camión sale en su propio viaje.
    viajes = _motor().asignar_y_ordenar([_pedido(1, peso=5000.0), _pedido(2)], [_camion("A")])
    assert [_ids(v) for v in viajes] == [[2], [1]]


def test_zonas_en_orden_y_camiones_rotan_entre_zonas():
    viajes = _motor().asignar_y_ordenar(
        [_pedido(1, "Z2"), _pedido(2, "Z1"), _pedido(3, "Z3")], [_camion("A"), _camion("B")])
    assert [(v["zona"], v["veh"]["id"]) for v in viajes] == [("Z1", "A"), ("Z2", "B"), ("Z3", "A")]


def test_paradas_por_vecino_mas_cercano_desde_el_deposito_y_sin_coordenadas_al_final():
    lat, lng = DEPOT
    viajes = _motor().asignar_y_ordenar([
        _pedido("lejos", lat=lat + 0.30, lng=lng), _pedido("sin"), _pedido("cerca", lat=lat + 0.01, lng=lng),
        _pedido("medio", lat=lat + 0.10, lng=lng),
    ], [_camion("A")])
    assert _ids(viajes[0]) == ["cerca", "medio", "lejos", "sin"]


def test_dias_de_anticipacion_por_la_parada_mas_lejana():
    lat, lng = DEPOT
    viajes = _motor().asignar_y_ordenar([
        _pedido(1, "GAM", lat=lat + 0.1, lng=lng),          # ~11 km → 1 día
        _pedido(2, "LEJOS", lat=lat + 1.0, lng=lng),         # ~111 km → 2 días
        _pedido(3, "SINCOORD"),                              # sin coordenadas → piso de 1 día
    ], [_camion("A")])
    assert {v["zona"]: v["lead"] for v in viajes} == {"GAM": 1, "LEJOS": 2, "SINCOORD": 1}


def test_mismo_input_mismo_resultado():
    m = _motor()
    pedidos = [_pedido(i, f"Z{i % 3}", peso=90.0 * (i % 4 + 1), lat=9.9 + i * 0.01, lng=-84.0) for i in range(30)]
    flota = [_camion("A"), _camion("B", cw=2000.0)]
    assert m.asignar_y_ordenar(list(pedidos), flota) == m.asignar_y_ordenar(list(pedidos), flota)
