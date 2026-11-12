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

    assert rec.agendar(run, "org", "wh", "cust", "2026-11-06", _clave) == 1
    corre = next(p for s, p in calls if s.startswith("UPDATE tbl_plan_stops"))
    inserta = next(p for s, p in calls if s.lstrip().startswith("INSERT INTO tbl_plan_stops"))
    agenda = next(p for s, p in calls if s.startswith("UPDATE tbl_returns SET pickup_date"))
    assert corre == ["t-z1", 3]
    assert inserta[:4] == ["t-z1", "ord-viejo", 4, "DEV-1"] and inserta[-1] == "ret-1"
    assert agenda == ["2026-11-06", "ret-1"]
