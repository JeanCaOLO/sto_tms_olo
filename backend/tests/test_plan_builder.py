"""El planificador persiste lo que devuelve el motor de ruteo, en su orden."""

from conftest import load_stack_module


def _pedido(pid, retira=False):
    return {"id": pid, "order_number": f"N{pid}", "customer_name": "Ferretería", "customer_type": "MAYOREO",
            "delivery_city": "San José", "delivery_zone": "Z1", "lat": None, "lng": None, "weight": 10.0,
            "volume": 1.0, "es_cliente_retira": retira, "eflow_id_expedicion": None}


def _fake_query(almacen, consultas, camion):
    def query(sql, params):
        consultas.append((sql, params))
        if "tbl_vehicles" in sql:
            return [camion]
        if "w.latitude" in sql:
            return [almacen]
        if "external_code" in sql:
            return [{"external_code": "0012"}]
        return [_pedido(2), _pedido(1), _pedido(3, retira=True)]
    return query


def test_persiste_los_viajes_del_motor_y_cliente_retira_va_sin_camion(monkeypatch):
    pb = load_stack_module("planning", "plan_builder")
    camion = {"id": "V1", "plate": "ABC", "cw": 1000.0, "cv": 10.0}
    consultas = []
    query = _fake_query({"lat": None, "lng": None, "pais": "CR"}, consultas, camion)

    llamadas = []

    def run(sql, params):
        llamadas.append((sql, params))
        if "count(*) AS n" in sql:
            return []  # ningún camión con viaje ese día
        return [{"id": f"id{len(llamadas)}"}]

    monkeypatch.setattr(pb.pg, "query", query)
    monkeypatch.setattr(pb.pg, "run_in_transaction", lambda trabajo: trabajo(run))
    monkeypatch.setattr(pb.viajes_liberados, "borrar_no_liberado", lambda *a: None)
    monkeypatch.setattr(pb.viajes_liberados, "plan_vigente", lambda *a: (None, 0))
    monkeypatch.setattr(pb.recolectas, "agendar", lambda *a: 0)

    assert pb.construir_y_persistir("org", "cr", "wh", "cust", "2026-11-20", "user")

    viajes = [p for s, p in llamadas if "INSERT INTO tbl_plan_trips" in s]
    # (vehículo, zona, secuencia, nº de viaje): el de camión y luego el de cliente retira.
    assert [(p[1], p[2], p[3], p[10]) for p in viajes] == [
        ("V1", "Z1", 1, "20261120-0012-001"), (None, "RETIRA", 2, "20261120-0012-002")]
    paradas = [(p[1], p[2]) for s, p in llamadas if "INSERT INTO tbl_plan_stops" in s]
    assert paradas == [(2, 1), (1, 2), (3, 1)]  # (pedido, nº de parada)
    # La flota se pide por el país del almacén, no de toda la organización.
    assert [p for s, p in consultas if "tbl_vehicles" in s] == [["org", "wh"]]


def test_el_motor_recibe_la_sede_del_almacen(monkeypatch):
    pb = load_stack_module("planning", "plan_builder")
    consultas, recibidas = [], []
    monkeypatch.setattr(pb.pg, "query", _fake_query({"lat": 10.2, "lng": -68.0, "pais": "VN"}, consultas,
                                                    {"id": "V1", "plate": "ABC", "cw": 1000.0, "cv": 10.0}))
    monkeypatch.setattr(pb.pg, "run_in_transaction",
                        lambda trabajo: trabajo(lambda sql, params: [] if "count(*) AS n" in sql else [{"id": "x"}]))
    monkeypatch.setattr(pb.viajes_liberados, "borrar_no_liberado", lambda *a: None)
    monkeypatch.setattr(pb.viajes_liberados, "plan_vigente", lambda *a: (None, 0))
    monkeypatch.setattr(pb.recolectas, "agendar", lambda *a: 0)
    real = pb.motor_ruteo.asignar_y_ordenar
    monkeypatch.setattr(pb.motor_ruteo, "asignar_y_ordenar",
                        lambda pedidos, flota, sede, usos, informe: recibidas.append(sede) or real(pedidos, flota, sede, usos,
                                                                                                informe=informe))

    pb.construir_y_persistir("org", "ve", "wh", "cust", "2026-11-20", "user")
    assert recibidas[0].deposito == (10.2, -68.0) and recibidas[0].region == "VN" and recibidas[0].origen == "almacen"


def test_sin_flota_propia_del_pais_no_planifica(monkeypatch):
    pb = load_stack_module("planning", "plan_builder")
    from tms_common.errors import HttpError

    def query(sql, params):
        if "tbl_vehicles" in sql:
            return []  # la flota propia es de Costa Rica; el almacén es de Venezuela
        return [_pedido(1)]

    monkeypatch.setattr(pb.pg, "query", query)
    try:
        pb.construir_y_persistir("org", "ve", "wh", "cust", "2026-11-20", "user")
    except HttpError as e:
        assert e.status == 409 and "país" in str(e)
    else:
        raise AssertionError("debía rechazar el plan")


def test_el_motor_recibe_los_camiones_que_ya_tienen_viaje_ese_dia(monkeypatch):
    pb = load_stack_module("planning", "plan_builder")
    consultas, recibidos = [], []
    monkeypatch.setattr(pb.pg, "query", _fake_query({"lat": None, "lng": None, "pais": "CR"}, consultas,
                                                    {"id": "V1", "plate": "ABC", "cw": 1000.0, "cv": 10.0}))
    usos_sql = []

    def run(sql, params):
        if "count(*) AS n" in sql:
            usos_sql.append(params)
            return [{"id": "V1", "n": 1}, {"id": "V9", "n": 2}]  # congelado propio y viajes de otra compañía
        return [{"id": "x"}]

    monkeypatch.setattr(pb.pg, "run_in_transaction", lambda trabajo: trabajo(run))
    monkeypatch.setattr(pb.viajes_liberados, "borrar_no_liberado", lambda *a: None)
    monkeypatch.setattr(pb.viajes_liberados, "plan_vigente", lambda *a: (None, 0))
    monkeypatch.setattr(pb.recolectas, "agendar", lambda *a: 0)
    monkeypatch.setattr(pb.motor_ruteo, "asignar_y_ordenar",
                        lambda pedidos, flota, sede, usos, informe: recibidos.append(usos) or [])

    pb.construir_y_persistir("org", "cr", "wh", "cust", "2026-11-20", "user")
    assert recibidos == [{"V1": 1, "V9": 2}]
    assert usos_sql == [["org", "wh", "2026-11-20"]]  # todo el almacén ese día, no solo esta compañía


def test_cada_corrida_queda_registrada_con_entrada_resultado_y_motor(monkeypatch):
    import json
    pb = load_stack_module("planning", "plan_builder")
    consultas, llamadas = [], []
    monkeypatch.setattr(pb.pg, "query", _fake_query({"lat": 10.0, "lng": -84.0, "pais": "CR"}, consultas,
                                                    {"id": "V1", "plate": "ABC", "cw": 1000.0, "cv": 10.0}))

    def run(sql, params):
        llamadas.append((sql, params))
        return [] if "count(*) AS n" in sql else [{"id": "plan-1"}]

    monkeypatch.setattr(pb.pg, "run_in_transaction", lambda trabajo: trabajo(run))
    monkeypatch.setattr(pb.viajes_liberados, "borrar_no_liberado", lambda *a: None)
    monkeypatch.setattr(pb.viajes_liberados, "plan_vigente", lambda *a: (None, 0))
    monkeypatch.setattr(pb.recolectas, "agendar", lambda *a: 0)

    pb.construir_y_persistir("org", "cr", "wh", "cust", "2026-11-20", "user")
    registros = [p for s, p in llamadas if "INSERT INTO tbl_routing_runs" in s]
    assert len(registros) == 1  # una por corrida; cliente retira no pasa por el motor
    r = registros[0]
    assert r[1:6] == ["org", "wh", "cust", "2026-11-20", "plan-1"]
    assert r[6:11] == ["heuristico", "heuristico", "CR", "almacen", None]  # motor, solicitado, región, depósito, matriz
    assert (r[11], r[12]) == (2, 1)  # pedidos, viajes
    entrada, resultado = json.loads(r[17]), json.loads(r[18])
    assert entrada["sede"] == {"deposito": [10.0, -84.0], "region": "CR", "origen": "almacen"}
    assert sorted(o["id"] for o in entrada["pedidos"]) == [1, 2] and entrada["flota"][0]["id"] == "V1"
    assert resultado[0]["camion"] == "V1" and sorted(resultado[0]["pedidos"]) == [1, 2]
    assert json.loads(r[16])["max_paradas"] == pb.motor_ruteo.MAX_PARADAS
    assert r[19] == "user"
