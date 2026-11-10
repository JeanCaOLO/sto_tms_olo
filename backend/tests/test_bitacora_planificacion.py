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
