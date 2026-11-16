"""Fase 6: costo por tipo de camión desde las tablas de costeo, y terceros como segunda opción."""

import pytest
from conftest import load_stack_module

TIPOS = [{"codigo": "t1", "kg": 2500.0, "kml": 8.5}, {"codigo": "t3", "kg": 4500.0, "kml": 6.0},
         {"codigo": "t5", "kg": 7000.0, "kml": 4.2}]
VARIABLE = [{"codigo": "t1", "km": 39.05}, {"codigo": "t3", "km": 48.81}, {"codigo": "t5", "km": 68.39}]
FIJO = [{"codigo": "t1", "mes": 1113437.16}, {"codigo": "t3", "mes": 1224548.27}, {"codigo": "t5", "mes": 1432881.6}]
PARAMETROS = [{"clave": "precio_diesel", "valor": 635.0}, {"clave": "dias_operativos", "valor": 30.0}]
# Tarifario de prueba: el transportista C-KM cobra por km, C-FIJO tarifa fija, C-ZONA tabla zona × camión,
# C-PARADA por parada y C-SIN no tiene reglas.
REGLAS = [
    {"carrier": "C-KM", "rate_type": "PER_KM", "party": "P-KM", "code": "BASE_KM", "base_method": "PER_KM",
     "expression": {"op": "PER_KM", "rate": "897.00"}},
    {"carrier": "C-KM", "rate_type": "PER_KM", "party": "P-KM", "code": "BASE_FIJA", "base_method": "FIXED",
     "expression": {"op": "FIXED", "amount": "135000"}},
    {"carrier": "C-FIJO", "rate_type": None, "party": "P-FIJO", "code": "BASE_KM", "base_method": "PER_KM",
     "expression": {"op": "PER_KM", "rate": "897.00"}},
    {"carrier": "C-FIJO", "rate_type": None, "party": "P-FIJO", "code": "BASE_FIJA", "base_method": "FIXED",
     "expression": {"op": "FIXED", "amount": "135000"}},
    {"carrier": "C-ZONA", "rate_type": "FIXED", "party": "P-ZONA", "code": "BASE_FLETE", "base_method": "FIXED",
     "expression": {"op": "LOOKUP_TABLE", "table": "FLETE", "fallback": {"op": "PER_KM", "rate": "530"}}},
    {"carrier": "C-PARADA", "rate_type": "PER_UNIT", "party": "P-PARADA", "code": "BASE_UNIDAD", "base_method": "PER_UNIT",
     "expression": {"op": "PER_UNIT", "rate": "11200", "unit": "clientCount"}},
]
TABLAS = [{"party": "P-ZONA", "code": "FLETE", "key": ["01", "Camión pequeño"], "amount": 23800.0},
          {"party": "P-ZONA", "code": "FLETE", "key": ["01", "*"], "amount": 99999.0},
          {"party": "P-ZONA", "code": "FLETE", "key": ["02", "*"], "amount": 25500.0}]


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
        if "tbl_tarifas_pricing_rules" in sql:
            return [r for r in REGLAS if r["carrier"] in params[0]]
        if "tbl_tarifas_rate_tables" in sql:
            return [t for t in TABLAS if t["party"] in params[0]]
        raise AssertionError(sql)
    monkeypatch.setattr(mod.pg, "query", query)
    yield mod
    mod._cache = None


def _camion(vid, cw, propio=True, carrier=None, tipo=None):
    return {"id": vid, "plate": vid, "cw": cw, "cv": 100.0, "propio": propio, "carrier_id": carrier, "vehicle_type": tipo}


def test_costo_por_km_y_por_dia_segun_el_tipo_de_camion(cs):
    c = cs.por_vehiculo([_camion("A", 2500), _camion("B", 4000), _camion("C", 8000)], "CR")
    assert c["A"] == {"tipo": "t1", "km": round(39.05 + 635 / 8.5, 2), "dia": round(1113437.16 / 30, 2),
                      "viaje": 0.0, "parada": 0.0, "fuente": "costeo"}
    assert c["B"]["tipo"] == "t3" and c["C"]["tipo"] == "t5"  # 8000 kg no cabe en ninguno: el más grande


def test_un_tercero_sin_tarifa_cuesta_el_propio_equivalente_por_el_factor_por_viaje(cs):
    c = cs.por_vehiculo([_camion("P", 2500), _camion("T", 2500, propio=False, carrier="C-SIN")], "CR")
    assert c["T"]["km"] == pytest.approx(c["P"]["km"] * cs.FACTOR_TERCERO, abs=0.01)
    assert c["T"]["viaje"] == pytest.approx(c["P"]["dia"] * cs.FACTOR_TERCERO, abs=0.01)
    assert (c["T"]["dia"], c["T"]["fuente"]) == (0.0, "factor")


def test_un_tercero_con_tarifario_usa_la_regla_de_su_rate_type(cs):
    flota = [_camion("KM", 2500, False, "C-KM"), _camion("FIJO", 2500, False, "C-FIJO"),
             _camion("PARADA", 2500, False, "C-PARADA")]
    c = cs.por_vehiculo(flota, "CR")
    assert (c["KM"]["km"], c["KM"]["viaje"], c["KM"]["fuente"]) == (897.0, 0.0, "tarifario:BASE_KM")
    # Sin rate_type: la tarifa fija por viaje.
    assert (c["FIJO"]["km"], c["FIJO"]["viaje"], c["FIJO"]["fuente"]) == (0.0, 135000.0, "tarifario:BASE_FIJA")
    assert (c["PARADA"]["parada"], c["PARADA"]["viaje"]) == (11200.0, 0.0)


def test_la_tabla_zona_por_camion_da_monto_por_zona_y_comodin(cs):
    c = cs.por_vehiculo([_camion("Z", 2500, False, "C-ZONA", "Camión pequeño"),
                         _camion("Y", 2500, False, "C-ZONA", "Camión")], "CR")
    assert c["Z"]["por_zona"] == {"01": 23800.0, "02": 25500.0}  # el tipo exacto gana al comodín en la zona 01
    assert c["Y"]["por_zona"] == {"01": 99999.0, "02": 25500.0}
    assert c["Z"]["km"] == 530.0  # zona no listada: respaldo por km de la regla


def test_si_el_tarifario_falla_los_terceros_usan_el_factor(cs, monkeypatch):
    real = cs.pg.query

    def query(sql, params=()):
        if "tbl_tarifas" in sql:
            raise RuntimeError("sin permiso")
        return real(sql, params)
    monkeypatch.setattr(cs.pg, "query", query)
    assert cs.por_vehiculo([_camion("T", 2500, False, "C-KM")], "CR")["T"]["fuente"] == "factor"


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


def test_el_solver_cobra_la_tarifa_del_tercero_por_zona(cs, mo):
    # Dos terceros en la zona 02: la tabla le cobra 25.500 al de la tabla y 135.000 fijos al otro.
    flota = [_camion("ZONA", 2500, False, "C-ZONA", "Camión"), _camion("FIJO", 2500, False, "C-FIJO")]
    viajes = mo.asignar_y_ordenar([_pedido(1, "02")], flota, costos=cs.por_vehiculo(flota, "CR"))
    assert [v["veh"]["id"] for v in viajes] == ["ZONA"]


def test_con_una_vuelta_un_propio_no_repite_y_lo_que_no_cabe_queda_sin_camion(cs, mo, monkeypatch):
    monkeypatch.setenv("PROPIOS_UNA_VUELTA", "si")
    flota = [_camion("P1", 2500), _camion("P2", 2500)]
    informe = {}
    pedidos = [_pedido(i, f"Z{i}", dlat=0.05 * (i + 1)) for i in range(3)]  # tres zonas = tres viajes
    viajes = mo.asignar_y_ordenar(pedidos, flota, informe=informe, costos=cs.por_vehiculo(flota, "CR"))
    assert sorted(v["veh"]["id"] for v in viajes) == ["P1", "P2"]
    assert len(informe["sin_camion"]) == 1
    # Con un tercero, el tercer viaje va en el tercero y nadie se queda sin camión.
    flota.append(_camion("T", 2500, False, "C-FIJO"))
    informe = {}
    viajes = mo.asignar_y_ordenar(pedidos, flota, informe=informe, costos=cs.por_vehiculo(flota, "CR"))
    assert sorted(v["veh"]["id"] for v in viajes) == ["P1", "P2", "T"] and informe["sin_camion"] == []
    # Un propio que ya tiene viaje ese día no vuelve a salir.
    viajes = mo.asignar_y_ordenar(pedidos[:1], flota, usos_previos={"P1": 1, "P2": 1}, costos=cs.por_vehiculo(flota, "CR"))
    assert [v["veh"]["id"] for v in viajes] == ["T"]


def test_con_una_vuelta_la_heuristica_tambien(monkeypatch):
    monkeypatch.setenv("PROPIOS_UNA_VUELTA", "si")
    mr = load_stack_module("planning", "motor_ruteo")
    flota = [_camion("P1", 2500), _camion("T", 2500, False)]
    informe = {}
    viajes = mr.heuristico([_pedido(i, f"Z{i}") for i in range(3)], flota, usos_previos={"P1": 0}, informe=informe)
    assert [v["veh"]["id"] for v in viajes] == ["P1", "T", "T"] and informe["sin_camion"] == []
    viajes = mr.heuristico([_pedido(i, f"Z{i}") for i in range(3)], flota[:1], informe=informe)
    assert [v["veh"]["id"] for v in viajes] == ["P1"] and len(informe["sin_camion"]) == 2


def test_el_viaje_trae_su_duracion_estimada(mo):
    viajes = mo.asignar_y_ordenar([_pedido(1, dlat=0.1), _pedido(2, dlat=0.2)], [_camion("A", 2500)])
    assert viajes[0]["minutos"] >= 2 * mo.MIN_POR_PARADA

