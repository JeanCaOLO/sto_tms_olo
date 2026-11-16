"""Retención del registro de corridas: borra lo viejo y nunca tumba el replan."""

import pytest
from conftest import load_stack_module


@pytest.fixture
def rt(monkeypatch):
    monkeypatch.delenv("ROUTING_RUNS_RETENCION_DIAS", raising=False)
    return load_stack_module("planning", "retencion")


def test_borra_las_corridas_de_mas_de_90_dias(rt, monkeypatch):
    llamadas = []
    monkeypatch.setattr(rt.pg, "query", lambda sql, params: llamadas.append((sql, params)) or [{"id": 1}, {"id": 2}])
    assert rt.purgar() == 2
    assert "DELETE FROM tbl_routing_runs" in llamadas[0][0] and llamadas[0][1] == [90]


def test_con_cero_no_borra_nada(rt, monkeypatch):
    monkeypatch.setenv("ROUTING_RUNS_RETENCION_DIAS", "0")
    monkeypatch.setattr(rt.pg, "query", lambda *a: pytest.fail("no debe borrar"))
    assert rt.purgar() == 0


@pytest.mark.parametrize("valor, esperado", [("30", 30), ("x", 90), ("-5", 0), ("", 90)])
def test_dias_desde_la_variable(rt, monkeypatch, valor, esperado):
    monkeypatch.setenv("ROUTING_RUNS_RETENCION_DIAS", valor)
    assert rt.dias() == esperado


def test_si_el_borrado_falla_el_replan_sigue(rt, monkeypatch):
    def revienta(*a):
        raise RuntimeError("sin permiso DELETE")
    monkeypatch.setattr(rt.pg, "query", revienta)
    assert rt.purgar() == 0
