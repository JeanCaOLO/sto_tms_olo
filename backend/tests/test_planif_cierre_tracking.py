"""Planificación (backend-planif) cierra en todo: completar/cancelar un viaje o el plan cierra también la ruta
de Tracking ligada (routes.plan_trip_id), en la misma transacción y sin pisar un cierre previo."""

import contextlib
import importlib
import sys
from pathlib import Path

import pytest

PLANIF_SRC = Path(__file__).resolve().parents[2] / "backend-planif" / "src"


@pytest.fixture
def repo(monkeypatch):
    monkeypatch.syspath_prepend(str(PLANIF_SRC))
    for name in [m for m in sys.modules if m == "adapters" or m.startswith(("adapters.", "domain", "lib.", "ports"))]:
        monkeypatch.delitem(sys.modules, name)  # cargar los módulos de backend-planif, no los de otro stack
    plan_repo = importlib.import_module("adapters.outbound.aurora.plan_repo")
    calls = []
    state = {"schema": True}

    @contextlib.contextmanager
    def transaction():
        def run(sql, params=()):
            calls.append((" ".join(sql.split()), list(params)))
            return [{"plan_id": "plan-1"}] if "RETURNING plan_id" in sql else []
        yield run

    monkeypatch.setattr(plan_repo.pg, "transaction", transaction)
    monkeypatch.setattr(plan_repo, "tabla_existe", lambda name: name == "route_plans" or state["schema"])
    repository = plan_repo.AuroraPlanRepo()
    monkeypatch.setattr(repository, "obtener", lambda plan_id: f"plan:{plan_id}")
    return repository, calls, state


@pytest.mark.parametrize("status, route_status", [("completed", "Completada"), ("cancelled", "Cancelada")])
def test_closing_a_trip_closes_its_tracking_route(repo, status, route_status):
    repository, calls, _ = repo
    assert repository.actualizar_estado_viaje("trip-1", status) == "plan:plan-1"
    sql, params = calls[1]
    assert sql.startswith("UPDATE routes SET status") and "actual_end_time IS NULL" in sql
    assert params == [route_status, "trip-1"]


def test_reopening_a_trip_does_not_touch_tracking(repo):
    repository, calls, _ = repo
    repository.actualizar_estado_viaje("trip-1", "pending")
    assert not any(sql.startswith("UPDATE routes") for sql, _ in calls)


def test_closing_the_plan_closes_the_routes_of_all_its_trips(repo):
    repository, calls, _ = repo
    repository.actualizar_estado("plan-1", "completed")
    sql, params = calls[1]
    assert "FROM plan_trips pt WHERE pt.plan_id = %s" in sql and params == ["Completada", "plan-1"]
    calls.clear()
    repository.actualizar_estado("plan-1", "confirmed")  # confirmar no cierra nada
    assert not any(sql.startswith("UPDATE routes") for sql, _ in calls)


def test_without_tracking_schema_planificacion_works_as_before(repo):
    repository, calls, state = repo
    state["schema"] = False
    repository.actualizar_estado_viaje("trip-1", "completed")
    assert [sql.split()[1] for sql, _ in calls] == ["plan_trips"]
