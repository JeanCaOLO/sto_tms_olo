"""Motor de ruteo con OR-Tools y el interruptor MOTOR_RUTEO (heurística por defecto y de respaldo)."""

import sys

import pytest
from conftest import load_stack_module

pytest.importorskip("ortools")

DEPOT = (9.9281, -84.0907)  # ruta_geo.DEPOT_CR


@pytest.fixture
def motores(monkeypatch):
    """(motor_ruteo, motor_ortools) sin OSRM: la matriz sale en línea recta, sin red."""
    monkeypatch.delenv("OSRM_URL", raising=False)
    monkeypatch.delenv("MOTOR_RUTEO", raising=False)
    return load_stack_module("planning", "motor_ruteo"), load_stack_module("planning", "motor_ortools")


def _pedido(pid, zona="Z1", peso=100.0, vol=1.0, dlat=None, dlng=0.0, cliente="Ferretería", tipo="MAYOREO"):
    """`dlat`/`dlng` = desplazamiento en grados desde el depósito; sin `dlat` = sin coordenadas."""
    return {"id": pid, "delivery_zone": zona, "weight": peso, "volume": vol, "customer_name": cliente,
            "customer_type": tipo, "lat": None if dlat is None else DEPOT[0] + dlat,
            "lng": None if dlat is None else DEPOT[1] + dlng}


def _camion(vid, cw=1000.0, cv=100.0):
    return {"id": vid, "plate": f"P-{vid}", "cw": cw, "cv": cv}


def _ids(viaje):
    return [o["id"] for o in viaje["pedidos"]]


def _validar(mr, viajes, pedidos):
    """Lo que todo motor debe cumplir: nadie se pierde ni se repite, y se respetan grupo y capacidad."""
    assert sorted(i for v in viajes for i in _ids(v)) == sorted(o["id"] for o in pedidos)
    for v in viajes:
        assert {mr.clave(o) for o in v["pedidos"]} == {v["zona"]}
        assert set(v) == {"zona", "veh", "pedidos", "peso", "volumen", "lead"}
        if len(v["pedidos"]) > 1:
            assert len(v["pedidos"]) <= mr.MAX_PARADAS
            assert v["peso"] <= v["veh"]["cw"] * mr.MARGEN_PESO + 1e-6
            assert v["volumen"] <= v["veh"]["cv"] * mr.MARGEN_VOLUMEN + 1e-6


def test_junta_en_un_camion_los_pedidos_cercanos_entre_si(motores):
    mr, mo = motores
    # Dos racimos opuestos (norte y sur), intercalados en la lista; cada camión lleva 4 pedidos.
    pedidos = [_pedido(f"{'N' if i % 2 else 'S'}{i}", peso=200.0, dlat=(0.30 if i % 2 else -0.30) + i * 0.001)
               for i in range(8)]
    viajes = mo.asignar_y_ordenar(pedidos, [_camion("A"), _camion("B")])
    _validar(mr, viajes, pedidos)
    assert sorted("".join(sorted({i[0] for i in _ids(v)})) for v in viajes) == ["N", "S"]
    # La heurística llena por orden de lista y mezcla norte con sur en el mismo camión.
    assert any({i[0] for i in _ids(v)} == {"N", "S"} for v in mr.heuristico(pedidos, [_camion("A"), _camion("B")]))


def test_respeta_peso_volumen_y_tope_de_paradas(motores):
    mr, mo = motores
    pedidos = ([_pedido(f"p{i}", "PESO", peso=300.0, dlat=0.01 * i) for i in range(7)]            # 850 kg → 2 por camión
               + [_pedido(f"v{i}", "VOL", peso=1.0, vol=30.0, dlat=0.01 * i) for i in range(7)]     # 95 m³ → 3 por camión
               + [_pedido(f"n{i}", "MUCHOS", peso=1.0, vol=0.1, dlat=0.001 * i) for i in range(mr.MAX_PARADAS + 3)])
    viajes = mo.asignar_y_ordenar(pedidos, [_camion(c) for c in "ABCDEFGHIJ"])
    _validar(mr, viajes, pedidos)
    por_zona = {z: sorted(len(v["pedidos"]) for v in viajes if v["zona"] == z) for z in ("PESO", "VOL", "MUCHOS")}
    assert por_zona == {"PESO": [1, 2, 2, 2], "VOL": [1, 3, 3], "MUCHOS": [3, mr.MAX_PARADAS]}


def test_no_mezcla_zonas_y_cada_tienda_va_en_viaje_directo(motores):
    mr, mo = motores
    pedidos = [_pedido(1, "Z1", dlat=0.10), _pedido(2, "Z2", dlat=0.10, dlng=0.001),
               _pedido(3, None, dlat=0.10, cliente="T005 TIBAS", tipo="TIENDA"),
               _pedido(4, None, dlat=0.10, cliente="T005 TIBAS", tipo="TIENDA"),
               _pedido(5, None, dlat=0.10, cliente="T008 CARTAGO", tipo="TIENDA")]
    viajes = mo.asignar_y_ordenar(pedidos, [_camion(c) for c in "ABCD"])
    _validar(mr, viajes, pedidos)
    assert {v["zona"]: sorted(_ids(v)) for v in viajes} == {"T005 TIBAS": [3, 4], "T008 CARTAGO": [5], "Z1": [1], "Z2": [2]}
    assert len({v["veh"]["id"] for v in viajes}) == 4  # un camión distinto por viaje mientras haya libres


def test_prefiere_el_camion_mas_chico_que_alcance(motores):
    _, mo = motores
    viajes = mo.asignar_y_ordenar([_pedido(1, peso=500.0, dlat=0.1)], [_camion("GRANDE", cw=8000.0), _camion("CHICO", cw=1000.0)])
    assert [v["veh"]["id"] for v in viajes] == ["CHICO"]


def test_mas_viajes_que_camiones_reparte_las_vueltas_entre_la_flota(motores):
    mr, mo = motores
    pedidos = [_pedido(i, peso=800.0, dlat=0.01 * (i + 1)) for i in range(5)]  # uno por camión
    viajes = mo.asignar_y_ordenar(pedidos, [_camion("A"), _camion("B")])
    _validar(mr, viajes, pedidos)
    assert sorted([v["veh"]["id"] for v in viajes].count(c) for c in "AB") == [2, 3]


def test_no_repite_camion_mientras_haya_otro_que_sirva(motores):
    mr, mo = motores
    # Dos zonas con un pedido pesado obligan a repetir el GRANDE (el único que puede). Las zonas
    # livianas deben ir cada una en un camión chico distinto, no repetir el primero.
    pedidos = [_pedido("liviano0", "Z0", peso=50.0, dlat=0.05), _pedido("pesado1", "Z1", peso=3000.0, dlat=0.10),
               _pedido("pesado2", "Z2", peso=3000.0, dlat=0.15), _pedido("liviano3", "Z3", peso=50.0, dlat=0.20)]
    flota = [_camion("GRANDE", cw=8000.0)] + [_camion(f"CHICO{i}", cw=500.0) for i in range(3)]
    viajes = mo.asignar_y_ordenar(pedidos, flota)
    _validar(mr, viajes, pedidos)
    camion = {_ids(v)[0]: v["veh"]["id"] for v in viajes}
    assert camion["pesado1"] == camion["pesado2"] == "GRANDE"
    assert camion["liviano0"] != camion["liviano3"]


def test_solo_invierte_el_sentido_si_no_alarga_el_recorrido(motores, monkeypatch):
    _, mo = motores
    # Matriz asimétrica: 0→1→2→0 = 3 km; al revés (0→2→1→0) = 201 km, aunque 2 esté más cerca del depósito.
    km = [[0, 2, 1], [100, 0, 0.5], [0.5, 100, 0]]
    monkeypatch.setattr(mo.matriz_distancias, "construir", lambda puntos, region: {"km": km, "fuente": "osrm"})
    viajes = mo.asignar_y_ordenar([_pedido(1, dlat=0.1), _pedido(2, dlat=0.2)], [_camion("A")])
    assert [_ids(v) for v in viajes] == [[1, 2]]


def test_un_pedido_que_excede_a_todos_va_solo_en_el_camion_mas_grande(motores):
    mr, mo = motores
    pedidos = [_pedido("enorme", peso=50000.0, dlat=0.1), _pedido("normal", dlat=0.1)]
    viajes = mo.asignar_y_ordenar(pedidos, [_camion("CHICO"), _camion("GRANDE", cw=5000.0)])
    _validar(mr, viajes, pedidos)
    assert {tuple(_ids(v)): v["veh"]["id"] for v in viajes} == {("normal",): "CHICO", ("enorme",): "GRANDE"}


def test_paradas_desde_la_mas_cercana_al_deposito_y_sin_coordenadas_al_final(motores):
    _, mo = motores
    viajes = mo.asignar_y_ordenar([_pedido("lejos", dlat=0.30), _pedido("sin"), _pedido("cerca", dlat=0.01),
                                   _pedido("medio", dlat=0.10)], [_camion("A")])
    assert [_ids(v) for v in viajes] == [["cerca", "medio", "lejos", "sin"]]
    assert viajes[0]["lead"] == 1 and viajes[0]["peso"] == 400.0


def test_mismo_input_mismo_resultado(motores):
    _, mo = motores
    pedidos = [_pedido(i, f"Z{i % 3}", peso=90.0 * (i % 4 + 1), dlat=0.02 * (i % 7), dlng=0.03 * (i % 5)) for i in range(60)]
    flota = [_camion("A"), _camion("B", cw=2000.0), _camion("C", cw=3000.0)]
    assert mo.asignar_y_ordenar(list(pedidos), list(flota)) == mo.asignar_y_ordenar(list(pedidos), list(flota))


def test_si_el_solver_no_cierra_la_busqueda_lanza_y_no_devuelve_un_plan_a_medias(motores, monkeypatch):
    _, mo = motores
    monkeypatch.setattr(mo, "TIEMPO_LIMITE_S", 0)  # como si la búsqueda hubiera agotado el tiempo
    with pytest.raises(RuntimeError, match="no cerró la búsqueda"):
        mo.asignar_y_ordenar([_pedido(1, dlat=0.1)], [_camion("A")])


# --- Interruptor ---------------------------------------------------------------------

PEDIDOS = [_pedido(i, peso=200.0, dlat=(0.30 if i % 2 else -0.30)) for i in range(8)]
FLOTA = [_camion("A"), _camion("B")]


def test_por_defecto_corre_la_heuristica_y_no_toca_el_solver(motores, monkeypatch):
    mr, mo = motores
    monkeypatch.setattr(mo, "asignar_y_ordenar", lambda *a: pytest.fail("no debe usar el solver"))
    assert mr.motor_activo() == "heuristico"
    assert mr.asignar_y_ordenar(PEDIDOS, FLOTA) == mr.heuristico(PEDIDOS, FLOTA)


@pytest.mark.parametrize("valor", ["ortools", " OrTools "])
def test_con_el_interruptor_corre_el_solver(motores, monkeypatch, valor):
    mr, mo = motores
    monkeypatch.setenv("MOTOR_RUTEO", valor)
    assert mr.motor_activo() == "ortools"
    assert mr.asignar_y_ordenar(PEDIDOS, FLOTA) == mo.asignar_y_ordenar(PEDIDOS, FLOTA) != mr.heuristico(PEDIDOS, FLOTA)


def test_si_el_solver_falla_ese_dia_sale_con_la_heuristica(motores, monkeypatch, caplog):
    mr, mo = motores
    monkeypatch.setenv("MOTOR_RUTEO", "ortools")

    def revienta(*a):
        raise RuntimeError("OR-Tools no cerró la búsqueda")
    monkeypatch.setattr(mo, "_resolver", revienta)
    assert mr.asignar_y_ordenar(PEDIDOS, FLOTA) == mr.heuristico(PEDIDOS, FLOTA)
    assert "se usa la heurística" in caplog.text


def test_si_la_libreria_no_esta_instalada_sale_con_la_heuristica(motores, monkeypatch):
    mr, _ = motores
    monkeypatch.setenv("MOTOR_RUTEO", "ortools")
    monkeypatch.setitem(sys.modules, "motor_ortools", None)  # import motor_ortools → ImportError
    assert mr.asignar_y_ordenar(PEDIDOS, FLOTA) == mr.heuristico(PEDIDOS, FLOTA)


def test_el_diagnostico_de_la_lambda_dice_que_motor_esta_activo_y_si_el_solver_responde(motores, monkeypatch):
    mr, _ = motores
    assert mr.estado() == {"motor": "heuristico", "ortools": {"ok": True, "version": mr.estado()["ortools"]["version"], "viajes": 1}}
    monkeypatch.setitem(sys.modules, "motor_ortools", None)
    assert mr.estado()["ortools"]["ok"] is False


def test_venezuela_sale_de_su_deposito_y_usa_su_mapa(motores, monkeypatch):
    mr, mo = motores
    ruta_geo = load_stack_module("planning", "ruta_geo")
    valencia = ruta_geo.Sede((10.1620, -68.0077), "VN", "almacen")
    pedidos = [{"id": i, "delivery_zone": "CARABOBO", "weight": 100.0, "volume": 1.0, "customer_name": "F",
                "customer_type": "MAYOREO", "lat": 10.16 + 0.02 * i, "lng": -68.0} for i in range(3)]
    regiones = []
    real = mo.matriz_distancias.construir
    monkeypatch.setattr(mo.matriz_distancias, "construir",
                        lambda puntos, region: regiones.append((puntos[0], region)) or real(puntos, region=region))
    viajes = mo.asignar_y_ordenar(pedidos, [_camion("A")], valencia)
    assert regiones == [((10.1620, -68.0077), "VN")]
    assert viajes[0]["lead"] == 1  # desde Valencia; desde San José serían ~19 días
    assert mr.heuristico(pedidos, [_camion("A")], valencia)[0]["lead"] == 1
