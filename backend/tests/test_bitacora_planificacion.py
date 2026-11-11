"""Historial de Planificación en la bitácora compartida (tbl_oms_logs)."""

import json

from conftest import load_stack_module


def _capturar(monkeypatch):
    bit = load_stack_module("planning", "bitacora")
    filas = []
    monkeypatch.setattr(bit.pg, "query", lambda sql, params=(): filas.append(params) or [])
    return bit, filas


def test_corrida_con_ingesta_queda_en_info(monkeypatch):
    bit, filas = _capturar(monkeypatch)
    bit.registrar_corrida("planif_replan_programado", "Replan programado", {"leidos": 90, "salidos": 78},
                          None, ["2026-11-11/x", "2026-11-12/x"], [], "system")
    level, action, _, message, detail, actor = filas[0]
    assert (level, action, actor) == ("info", "planif_replan_programado", "system")
    assert "2 día(s) planificado(s)" in message and "90 pedidos leídos" in message and "78 salieron" in message
    assert json.loads(detail)["total"] == 90


def test_sin_eflow_queda_en_warn_con_el_error(monkeypatch):
    bit, filas = _capturar(monkeypatch)
    ingesta, error = bit.ingestar(lambda: (_ for _ in ()).throw(RuntimeError('Sin credenciales EFLOW para país "cr"')))
    assert ingesta is None and "Sin credenciales" in error
    bit.registrar_corrida("planif_replan_manual", "Replanificar", ingesta, error, [], ["2026-11-12/x"], "manual")
    level, _, _, message, detail, _ = filas[0]
    assert level == "warn" and "eFlow no disponible (Sin credenciales" in message
    assert json.loads(detail)["error_ingesta"].startswith("Sin credenciales")


def test_la_bitacora_nunca_lanza(monkeypatch):
    bit = load_stack_module("planning", "bitacora")
    def falla(sql, params=()):
        raise RuntimeError("BD caída")
    monkeypatch.setattr(bit.pg, "query", falla)
    bit.registrar("planif_plan_dia", "x")  # no lanza


def test_ingesta_de_bandeja_ok_queda_en_info(monkeypatch):
    bit, filas = _capturar(monkeypatch)
    bit.registrar_ingesta({"leidos": 157, "salidos": 5}, None, "system")
    level, action, _, message, _, _ = filas[0]
    assert (level, action) == ("info", "planif_ingesta_bandeja")
    assert message == "Actualizar bandeja: 157 pedidos leídos de eFlow, 5 salieron de la cola"


def test_ingesta_programada_sin_eflow_registra_error_y_lanza(monkeypatch):
    replan = load_stack_module("planning", "replan")
    filas = []
    monkeypatch.setattr(replan.bitacora.pg, "query", lambda sql, params=(): filas.append(params) or [])
    def sin_credenciales():
        raise RuntimeError('Sin credenciales EFLOW para país "cr"')
    monkeypatch.setattr(replan.ingest_orders, "ingest_cr", sin_credenciales)
    try:
        replan.ingestar_programado()
        raise AssertionError("debió lanzar")
    except RuntimeError as exc:
        assert "Sin credenciales" in str(exc)
    assert filas[0][0] == "error" and "FALLÓ" in filas[0][3]


def test_replan_programado_ya_no_ingesta(monkeypatch):
    replan = load_stack_module("planning", "replan")
    monkeypatch.setattr(replan.ingest_orders, "ingest_cr", lambda: (_ for _ in ()).throw(AssertionError("no debe ingestar")))
    filas = []  # replan y bitacora comparten el módulo pg: se guardan solo los INSERT a la bitácora
    monkeypatch.setattr(replan.pg, "query", lambda sql, params=(): ("tbl_oms_logs" in sql and filas.append(params)) or [])
    replan.replanificar_programado()
    level, _, _, message, _, _ = filas[0]
    assert level == "info" and "eFlow" not in message
