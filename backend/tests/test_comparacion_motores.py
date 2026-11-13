"""Comparación en sombra: mide los dos motores igual y no escribe nada."""

import pytest
from conftest import load_stack_module

pytest.importorskip("ortools")

DEPOT = (9.9281, -84.0907)


def _pedido(pid, dlat, peso=200.0, retira=False, coords=True):
    return {"id": pid, "order_number": f"N{pid}", "delivery_zone": "Z1", "customer_name": "F", "customer_type": "MAYOREO",
            "delivery_city": "C", "weight": peso, "volume": 1.0, "es_cliente_retira": retira,
            "lat": DEPOT[0] + dlat if coords else None, "lng": DEPOT[1] if coords else None}


@pytest.fixture
def cm(monkeypatch):
    monkeypatch.delenv("OSRM_URL", raising=False)
    load_stack_module("planning", "motor_ortools")  # en la Lambda se importa tarde desde src/; aquí se precarga
    return load_stack_module("planning", "comparacion_motores")


def test_medir_cuenta_km_ida_y_vuelta_viajes_y_capacidad(cm):
    camion = {"id": "A", "cw": 1000.0, "cv": 10.0}
    viajes = [{"veh": camion, "pedidos": [{"id": 1, "lat": 0, "lng": 0}, {"id": 2, "lat": 0, "lng": 0},
                                          {"id": 3, "lat": None, "lng": None}], "peso": 500.0, "volumen": 2.0},
              {"veh": camion, "pedidos": [{"id": 4, "lat": 0, "lng": 0}, {"id": 5, "lat": 0, "lng": 0}],
               "peso": 900.0, "volumen": 2.0}]  # 900 > 850: fuera de capacidad
    km = {(None, 1): 10, (1, 2): 5, (2, None): 12, (None, 4): 3, (4, 5): 1, (5, None): 3}
    m = cm.medir(viajes, lambda a, b: km[(a, b)])
    assert m == {"viajes": 2, "camiones": 1, "km": 34.0, "paradas_prom": 2.5, "paradas_max": 3,
                 "ocupacion_peso_prom": 0.7, "viajes_fuera_de_capacidad": 1}


def test_comparar_dia_corre_los_dos_motores_sobre_los_mismos_pedidos(cm):
    pedidos = ([_pedido(i, (0.30 if i % 2 else -0.30) + i * 0.001) for i in range(8)]
               + [_pedido("r", 0.1, retira=True), _pedido("s", 0, coords=False)])
    flota = [{"id": "A", "plate": "A", "cw": 1000.0, "cv": 100.0}, {"id": "B", "plate": "B", "cw": 1000.0, "cv": 100.0}]
    r = cm.comparar_dia(pedidos, flota)
    assert (r["pedidos"], r["cliente_retira"], r["sin_coordenadas"], r["matriz"]) == (9, 1, 1, "haversine")
    assert (r["region"], r["deposito"]) == ("CR", "defecto_cr")
    assert r["heuristico"]["viajes_fuera_de_capacidad"] == r["ortools"]["viajes_fuera_de_capacidad"] == 0
    assert r["ortools"]["km"] < r["heuristico"]["km"] and r["ahorro_km_pct"] > 0


def test_si_el_solver_falla_el_dia_queda_con_el_error_y_sin_ahorro(cm, monkeypatch):
    mo = load_stack_module("planning", "motor_ortools")

    def revienta(*a):
        raise RuntimeError("boom")
    monkeypatch.setattr(mo, "asignar_y_ordenar", revienta)
    r = cm.comparar_dia([_pedido(1, 0.1)], [{"id": "A", "plate": "A", "cw": 1000.0, "cv": 100.0}])
    assert r["ortools"]["error"] == "RuntimeError: boom" and "ahorro_km_pct" not in r and "km" in r["heuristico"]


def test_comparar_todo_solo_lee(cm, monkeypatch):
    sql_vistos = []

    def query(sql, params):
        sql_vistos.append(sql)
        if "SELECT DISTINCT" in sql:
            return [{"org": "o", "wh": "w", "cust": "c", "compania": "COFERSA", "d": "2026-11-14"}]
        if "tbl_vehicles" in sql:
            return [{"id": "A", "plate": "A", "cw": 1000.0, "cv": 100.0}]
        if "w.latitude" in sql:
            return [{"lat": None, "lng": None, "pais": "CR"}]
        return [_pedido(i, 0.05 * (i + 1)) for i in range(5)]

    monkeypatch.setattr(cm.pg, "query", query)
    monkeypatch.setattr(cm.pg, "run_in_transaction", lambda *a: pytest.fail("no debe escribir"))
    r = cm.comparar_todo()
    assert r["total"]["dias_comparados"] == 1 and r["dias"][0]["compania"] == "COFERSA"
    assert r["dias"][0]["origen"] == "ventana"
    r = cm.comparar_todo(dias_atras=10)  # suma los días ya planificados
    assert [d["origen"] for d in r["dias"]] == ["ventana", "historico"] and r["total"]["dias_comparados"] == 2
    assert all(s.lstrip().upper().startswith("SELECT") for s in sql_vistos)
