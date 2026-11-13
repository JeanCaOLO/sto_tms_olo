"""Fase 6: costo por tipo de camión desde las tablas de costeo, y terceros como segunda opción."""

import pytest
from conftest import load_stack_module

TIPOS = [{"codigo": "t1", "kg": 2500.0, "kml": 8.5}, {"codigo": "t3", "kg": 4500.0, "kml": 6.0},
         {"codigo": "t5", "kg": 7000.0, "kml": 4.2}]
VARIABLE = [{"codigo": "t1", "km": 39.05}, {"codigo": "t3", "km": 48.81}, {"codigo": "t5", "km": 68.39}]
FIJO = [{"codigo": "t1", "mes": 1113437.16}, {"codigo": "t3", "mes": 1224548.27}, {"codigo": "t5", "mes": 1432881.6}]
PARAMETROS = [{"clave": "precio_diesel", "valor": 635.0}, {"clave": "dias_operativos", "valor": 30.0}]


@pytest.fixture
def cs(monkeypatch):
    mod = load_stack_module("planning", "costos")
    mod._cache = None
    monkeypatch.setenv("COSTOS_MODO", "reales")
    monkeypatch.delenv("USAR_TERCEROS", raising=False)

    def query(sql, params=()):
        for clave, filas in (("tbl_tipos_camion", TIPOS), ("vw_costo_variable", VARIABLE),
                             ("vw_costo_fijo", FIJO), ("tbl_parametros_globales", PARAMETROS)):
            if clave in sql:
                return filas
        raise AssertionError(sql)
    monkeypatch.setattr(mod.pg, "query", query)
    yield mod
    mod._cache = None


def _camion(vid, cw, propio=True):
    return {"id": vid, "plate": vid, "cw": cw, "cv": 100.0, "propio": propio}


def test_costo_por_km_y_por_dia_segun_el_tipo_de_camion(cs):
    c = cs.por_vehiculo([_camion("A", 2500), _camion("B", 4000), _camion("C", 8000)], "CR")
    assert c["A"] == {"tipo": "t1", "km": round(39.05 + 635 / 8.5, 2), "dia": round(1113437.16 / 30, 2)}
    assert c["B"]["tipo"] == "t3" and c["C"]["tipo"] == "t5"  # 8000 kg no cabe en ninguno: el más grande


def test_un_tercero_cuesta_el_propio_equivalente_por_el_factor(cs):
    c = cs.por_vehiculo([_camion("P", 2500), _camion("T", 2500, propio=False)], "CR")
    assert c["T"]["km"] == pytest.approx(c["P"]["km"] * cs.FACTOR_TERCERO, abs=0.01)
    assert c["T"]["dia"] == pytest.approx(c["P"]["dia"] * cs.FACTOR_TERCERO, abs=0.01)


@pytest.mark.parametrize("modo, region", [("fijo", "CR"), ("", "CR"), ("reales", "VN"), ("reales", None)])
def test_sin_modo_reales_o_fuera_de_costa_rica_no_hay_costos(cs, monkeypatch, modo, region):
    monkeypatch.setenv("COSTOS_MODO", modo)
    assert cs.por_vehiculo([_camion("A", 2500)], region) is None


def test_forzar_ignora_el_modo_para_la_comparacion(cs, monkeypatch):
    monkeypatch.setenv("COSTOS_MODO", "fijo")
    assert cs.por_vehiculo([_camion("A", 2500)], "CR", forzar=True)["A"]["tipo"] == "t1"


def test_si_las_tablas_fallan_se_planifica_sin_costos(cs, monkeypatch):
    def revienta(*a):
        raise RuntimeError("sin permiso")
    monkeypatch.setattr(cs.pg, "query", revienta)
    assert cs.por_vehiculo([_camion("A", 2500)], "CR") is None


@pytest.mark.parametrize("valor, esperado", [("si", True), ("SÍ", True), ("1", True), ("no", False), ("", False)])
def test_interruptor_de_terceros(cs, monkeypatch, valor, esperado):
    monkeypatch.setenv("USAR_TERCEROS", valor)
    assert cs.usar_terceros() is esperado


# --- El solver con costos -------------------------------------------------------------

pytest.importorskip("ortools")

DEPOT = (9.9281, -84.0907)


def _pedido(pid, zona="Z1", peso=100.0, dlat=0.1):
    return {"id": pid, "delivery_zone": zona, "weight": peso, "volume": 1.0, "customer_name": "F",
            "customer_type": "MAYOREO", "lat": DEPOT[0] + dlat, "lng": DEPOT[1]}


@pytest.fixture
def mo(monkeypatch):
    monkeypatch.delenv("OSRM_URL", raising=False)
    return load_stack_module("planning", "motor_ortools")


def test_con_costos_elige_el_camion_mas_barato_que_alcanza(cs, mo):
    flota = [_camion("T5", 7000), _camion("T1", 2500)]
    costos = cs.por_vehiculo(flota, "CR")
    informe = {}
    viajes = mo.asignar_y_ordenar([_pedido(1)], flota, informe=informe, costos=costos)
    assert [v["veh"]["id"] for v in viajes] == ["T1"]
    assert informe["costo_colones"] > costos["T1"]["dia"]  # día del camión + km


def test_tercero_antes_que_repetir_un_camion_propio(cs, mo):
    # Dos zonas, un solo camión propio: la segunda zona va en el tercero, no en una segunda vuelta.
    flota = [_camion("PROPIO", 2500), _camion("TERCERO", 2500, propio=False)]
    pedidos = [_pedido(1, "Z1", dlat=0.05), _pedido(2, "Z2", dlat=0.10)]
    viajes = mo.asignar_y_ordenar(pedidos, flota, costos=cs.por_vehiculo(flota, "CR"))
    assert sorted(v["veh"]["id"] for v in viajes) == ["PROPIO", "TERCERO"]
    # Con un solo pedido va siempre en el propio (más barato).
    assert [v["veh"]["id"] for v in mo.asignar_y_ordenar(pedidos[:1], flota, costos=cs.por_vehiculo(flota, "CR"))] == ["PROPIO"]


def test_si_falta_el_costo_de_un_camion_minimiza_km(cs, mo):
    flota = [_camion("A", 2500), _camion("B", 7000)]
    informe = {}
    mo.asignar_y_ordenar([_pedido(1)], flota, informe=informe, costos={"A": {"km": 100.0, "dia": 1000.0}})
    assert informe["costo_colones"] is None


def test_la_heuristica_no_usa_terceros(cs, monkeypatch):
    mr = load_stack_module("planning", "motor_ruteo")
    monkeypatch.delenv("MOTOR_RUTEO", raising=False)
    flota = [_camion("TERCERO", 8000, propio=False), _camion("PROPIO", 2500)]
    viajes = mr.asignar_y_ordenar([_pedido(1), _pedido(2, "Z2")], flota)
    assert {v["veh"]["id"] for v in viajes} == {"PROPIO"}


def test_un_viaje_en_tercero_se_guarda_como_no_propio(monkeypatch):
    pb = load_stack_module("planning", "plan_builder")
    llamadas = []

    def run(sql, params):
        llamadas.append((sql, params))
        return [{"id": "t"}]
    viaje = {"zona": "Z1", "veh": _camion("T", 2500, propio=False), "pedidos": [], "peso": 0.0, "volumen": 0.0, "lead": 1}
    pb._persistir_viaje(run, "plan", 1, viaje, "run", "20261120-0109-001")
    viaje_propio = {**viaje, "veh": _camion("P", 2500)}
    pb._persistir_viaje(run, "plan", 2, viaje_propio, "run", "20261120-0109-002")
    assert [p[9] for s, p in llamadas if "INSERT INTO tbl_plan_trips" in s] == [False, True]  # is_owned


def test_la_flota_suma_terceros_solo_con_el_interruptor(monkeypatch):
    pb = load_stack_module("planning", "plan_builder")
    monkeypatch.setattr(pb.pg, "query", lambda sql, params: [{"id": "T", "plate": "T", "cw": 1.0, "cv": 1.0, "propio": False}]
                        if "is_flota_propia, false" in sql else [{"id": "P", "plate": "P", "cw": 1.0, "cv": 1.0}])
    monkeypatch.delenv("USAR_TERCEROS", raising=False)
    assert [(c["id"], c["propio"]) for c in pb.flota_del_almacen("org", "wh")] == [("P", True)]
    monkeypatch.setenv("USAR_TERCEROS", "si")
    assert [(c["id"], c["propio"]) for c in pb.flota_del_almacen("org", "wh")] == [("P", True), ("T", False)]
