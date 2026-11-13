"""El planificador persiste lo que devuelve el motor de ruteo, en su orden."""

from conftest import load_stack_module


def _pedido(pid, retira=False):
    return {"id": pid, "order_number": f"N{pid}", "customer_name": "Ferretería", "customer_type": "MAYOREO",
            "delivery_city": "San José", "delivery_zone": "Z1", "lat": None, "lng": None, "weight": 10.0,
            "volume": 1.0, "es_cliente_retira": retira, "eflow_id_expedicion": None}


def test_persiste_los_viajes_del_motor_y_cliente_retira_va_sin_camion(monkeypatch):
    pb = load_stack_module("planning", "plan_builder")
    camion = {"id": "V1", "plate": "ABC", "cw": 1000.0, "cv": 10.0}

    def query(sql, params):
        if "tbl_vehicles" in sql:
            return [camion]
        if "external_code" in sql:
            return [{"external_code": "0012"}]
        return [_pedido(2), _pedido(1), _pedido(3, retira=True)]

    llamadas = []

    def run(sql, params):
        llamadas.append((sql, params))
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
