"""Recolectas: el planificador mete las devoluciones en un viaje que ya pasa por el cliente."""

from conftest import load_stack_module


def _clave(o):
    return o["customer_name"] if o.get("customer_type") == "TIENDA" else (o["delivery_zone"] or "S/R")


VIAJES = [
    {"trip_id": "t-z1", "clave": "Z1", "clientes": ["fc-a"]},
    {"trip_id": "t-z1b", "clave": "Z1", "clientes": ["fc-b"]},
    {"trip_id": "t-tienda", "clave": "T005 TIBAS", "clientes": ["fc-t005"]},
]


def _dev(fc, zona=None, nombre="Ferretería", tipo="MAYOREO"):
    return {"final_customer_id": fc, "delivery_zone": zona, "customer_name": nombre, "customer_type": tipo}


def test_va_al_viaje_que_ya_entrega_al_cliente():
    rec = load_stack_module("planning", "recolectas")
    assert rec.elegir_viaje(_dev("fc-b", "Z1"), VIAJES, _clave) == "t-z1b"


def test_sin_entrega_al_cliente_va_a_un_viaje_de_su_zona_o_tienda():
    rec = load_stack_module("planning", "recolectas")
    assert rec.elegir_viaje(_dev("fc-x", "Z1"), VIAJES, _clave) == "t-z1"
    assert rec.elegir_viaje(_dev("fc-otra", nombre="T005 TIBAS", tipo="TIENDA"), VIAJES, _clave) == "t-tienda"


def test_sin_viaje_que_pase_queda_sin_agendar():
    rec = load_stack_module("planning", "recolectas")
    assert rec.elegir_viaje(_dev("fc-x", "Z9"), VIAJES, _clave) is None


def test_agendar_inserta_la_parada_tras_el_cliente_y_fija_la_fecha():
    rec = load_stack_module("planning", "recolectas")
    calls = []

    def run(sql, params=None):
        calls.append((sql, params))
        if "FROM tbl_returns r" in sql and "SELECT" in sql:
            return [{"return_id": "ret-1", "return_number": "DEV-1", "order_id": "ord-viejo", "final_customer_id": "fc-a",
                     "delivery_zone": "Z1", "delivery_city": "Heredia", "lat": 10.0, "lng": -84.1,
                     "customer_name": "Ferretería A", "customer_type": "MAYOREO"},
                    {"return_id": "ret-2", "return_number": "DEV-2", "order_id": "ord-2", "final_customer_id": "fc-x",
                     "delivery_zone": "Z9", "delivery_city": None, "lat": None, "lng": None,
                     "customer_name": "Lejos", "customer_type": "MAYOREO"}]
        if "AS pos" in sql:
            return [{"pos": 3}]
        if "FROM tbl_plan_trips t" in sql:
            return VIAJES
        return []

    assert rec.agendar(run, "org", "wh", "cust", "2026-11-06", _clave, "actor") == 1
    corre = next(p for s, p in calls if s.startswith("UPDATE tbl_plan_stops"))
    inserta = next(p for s, p in calls if s.lstrip().startswith("INSERT INTO tbl_plan_stops"))
    agenda = next(p for s, p in calls if s.startswith("UPDATE tbl_returns SET pickup_date"))
    assert corre == ["t-z1", 3]
    assert inserta[:4] == ["t-z1", "ord-viejo", 4, "DEV-1"] and inserta[-1] == "ret-1"
    assert agenda == ["2026-11-06", "ret-1"]


# --- Contrato v2 (sql/77) -------------------------------------------------------------

def _run_v2(candidatas, falla_asignar=None):
    """run falso: sin históricas, los VIAJES de arriba y las candidatas v2 dadas."""
    import pg8000.dbapi
    calls = []

    def run(sql, params=None):
        calls.append((sql.strip(), params))
        if "vw_return_collection_candidates" in sql:
            return candidatas
        if "AS pos" in sql:
            return [{"pos": 1}]
        if "RETURNING id" in sql:
            return [{"id": "stop-nueva"}]
        if "assign_return_collection_v2" in sql and falla_asignar:
            raise pg8000.dbapi.DatabaseError({"C": falla_asignar, "M": "Recolecta excede capacidad del viaje"})
        if "FROM tbl_plan_trips t" in sql:
            return VIAJES
        return []
    return run, calls


def _cand(fc="fc-a", zona="Z1"):
    return {"request_id": "req-1", "order_id": "ord-1", "request_number": "SOL-1", "final_customer_id": fc,
            "customer_name": "Ferretería A", "delivery_city": "Heredia", "delivery_zone": zona, "customer_type": "MAYOREO"}


def test_v2_reserva_la_solicitud_en_el_viaje_del_cliente_dentro_de_un_savepoint():
    rec = load_stack_module("planning", "recolectas")
    run, calls = _run_v2([_cand()])
    assert rec.agendar(run, "org", "wh", "cust", "2026-11-19", _clave, "actor") == 1
    sqls = [s for s, _ in calls]
    i = sqls.index("SAVEPOINT recolecta_v2")
    assert sqls[i + 1].startswith("SELECT COALESCE(max(s.stop_order)")
    asigna = next(p for s, p in calls if "assign_return_collection_v2" in s)
    assert asigna[:5] == ["org", "req-1", "t-z1", "stop-nueva", "actor"]
    assert "RELEASE SAVEPOINT recolecta_v2" in sqls and "ROLLBACK TO SAVEPOINT recolecta_v2" not in sqls
    inserta = next(p for s, p in calls if "RETURNING id" in s)
    assert inserta[-1] is None  # parada nueva sin return_id histórico


def test_v2_si_falla_la_asignacion_deshace_solo_la_parada_y_registra_failed():
    rec = load_stack_module("planning", "recolectas")
    run, calls = _run_v2([_cand()], falla_asignar="23514")
    assert rec.agendar(run, "org", "wh", "cust", "2026-11-19", _clave, "actor") == 0
    assert ("ROLLBACK TO SAVEPOINT recolecta_v2", []) in calls
    evalua = next(p for s, p in calls if "record_return_collection_evaluation_v2" in s)
    assert evalua[4] == "planning.failed" and "capacidad" in evalua[5]


def test_v2_deadlock_no_se_trata_como_fallo_de_dominio():
    import pg8000.dbapi
    import pytest
    rec = load_stack_module("planning", "recolectas")
    run, _ = _run_v2([_cand()], falla_asignar="40P01")
    with pytest.raises(pg8000.dbapi.DatabaseError):
        rec.agendar(run, "org", "wh", "cust", "2026-11-19", _clave, "actor")


def test_v2_sin_viaje_registra_no_candidate_con_clave_estable():
    rec = load_stack_module("planning", "recolectas")
    run, calls = _run_v2([_cand("fc-x", "Z9")])
    rec.agendar(run, "org", "wh", "cust", "2026-11-19", _clave, "actor")
    run2, calls2 = _run_v2([_cand("fc-x", "Z9")])
    rec.agendar(run2, "org", "wh", "cust", "2026-11-19", _clave, "actor")
    e1 = next(p for s, p in calls if "record_return_collection_evaluation_v2" in s)
    e2 = next(p for s, p in calls2 if "record_return_collection_evaluation_v2" in s)
    assert e1[4] == "planning.no_candidate" and e1[3] == e2[3]  # el replan horario no duplica eventos
    assert not any("assign_return_collection_v2" in s for s, _ in calls)


def test_historicas_excluyen_las_devoluciones_creadas_por_v2():
    rec = load_stack_module("planning", "recolectas")
    assert "tbl_return_collection_results cr WHERE cr.return_id = r.id" in rec._ABIERTAS


def test_replan_cancela_las_recolectas_v2_antes_de_borrar_viajes():
    vl = load_stack_module("planning", "viajes_liberados")
    calls = []

    def run(sql, params=None):
        calls.append(sql.strip())
        return [{"id": "alloc-1"}] if "tbl_return_collection_allocations" in sql else []

    vl.borrar_no_liberado(run, "org", "wh", "cust", "2026-11-19", "actor")
    cancela = next(i for i, s in enumerate(calls) if "cancel_return_collection_v2" in s)
    borra = next(i for i, s in enumerate(calls) if s.startswith("DELETE FROM tbl_plan_stops"))
    assert cancela < borra
