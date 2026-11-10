"""Pedidos que salieron de la cola de eFlow: dejan la bandeja con el estado real de eFlow."""

from conftest import load_stack_module


def _preparar(monkeypatch, en_bandeja, en_eflow):
    sal = load_stack_module("planning", "salientes")
    updates = []

    def query(sql, params=()):
        if sql.lstrip().startswith("UPDATE"):
            updates.append(params)
            return []
        return [{"exp": e, "cia": c} for e, c in en_bandeja]

    class Nombres:
        db_sap = "EFLOW_OLO"

    monkeypatch.setattr(sal.pg, "query", query)
    monkeypatch.setattr(sal.eflow_db, "db_names", lambda pais: Nombres)
    monkeypatch.setattr(sal.eflow_db, "query", lambda pais, sql, params: en_eflow)
    return sal, updates


def _fila(exp, cia, es, si):
    return {"IDEXPEDICION": exp, "IDCOMPANIA": cia, "TPEXES": es, "TPEXSI": si}


def test_copia_el_estado_de_eflow_a_los_que_salieron_de_la_cola(monkeypatch):
    sal, updates = _preparar(monkeypatch, [("A", "0109"), ("B", "0109"), ("C", "0029")],
                             [_fila("B", "0109", "DESP", "CERR"), _fila("C", "0029", "DISP", "DISP")])
    n = sal.refrescar("cr", "org", {("A", "0109")})
    # A sigue en la cola: no se consulta; B cambió; C sigue DISP/DISP en eFlow (vencido real): no se toca.
    assert n == 1
    assert updates == [["DESP", "CERR", "org", "B", "0109"]]


def test_no_toca_la_misma_expedicion_de_otra_compania(monkeypatch):
    sal, updates = _preparar(monkeypatch, [("B", "0109")], [_fila("B", "0029", "DESP", "CERR")])
    assert sal.refrescar("cr", "org", set()) == 0
    assert updates == []
