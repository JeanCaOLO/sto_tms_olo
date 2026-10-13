"""Lecturas nuevas del tarifador: /batch, /find por POST, paginación por cursor (`after`), métricas
por request y topes de tiempo de sentencia. Todo dentro de backend/tarifas; la capa común no cambia."""

import json

import pytest

from conftest import body_of, http_event, load_stack_module, make_permissions
from tms_common import pg
from tms_common.errors import HttpError

USER = {"id": "auth-1", "email": "liquidador@ologistics.com"}
CR = "22222222-2222-2222-2222-222222222221"


class FakeDb:
    def __init__(self):
        self.calls = []
        self.results = None  # lista de respuestas por llamada; si es None, siempre [{"id": "x"}]
        self.error = None

    def query(self, sql, params=()):
        self.calls.append((sql, list(params)))
        if self.error:
            raise self.error
        if self.results is not None:
            return self.results[len(self.calls) - 1]
        return [{"id": "x"}]


@pytest.fixture
def api(monkeypatch):
    db = FakeDb()
    monkeypatch.setattr(pg, "query", db.query)
    app = load_stack_module("tarifas")
    metrics = load_stack_module("tarifas", "tarifas_metrics")
    tdb = load_stack_module("tarifas", "tarifas_db")
    tdb.reset_session()
    return app, db, metrics, tdb


def call(app, route, *, path=None, query=None, body=None):
    return app.handler(http_event(route, path=path, query=query, body=body, user=USER), None)


# ── /batch ─────────────────────────────────────────────────────────────────────────────────────

def test_batch_corre_varias_lecturas_y_devuelve_un_array_por_consulta(api):
    app, db, *_ = api
    db.results = [[{"id": "a"}], [{"id": "b"}, {"id": "c"}]]
    body = {"queries": [
        {"table": "tarifas_pricing_rules", "q": {"where": [{"column": "country_id", "op": "eq", "value": CR}]}},
        {"table": "tarifas_zone_groups"},
    ]}
    response = call(app, "POST /api/tarifas/batch", body=body)

    assert response["statusCode"] == 200
    assert body_of(response) == [[{"id": "a"}], [{"id": "b"}, {"id": "c"}]]
    assert len(db.calls) == 2
    assert 'FROM "tarifas_pricing_rules"' in db.calls[0][0] and 'FROM "tarifas_zone_groups"' in db.calls[1][0]
    assert db.calls[0][1] == [CR]


def test_batch_no_registra_actor_de_auditoria_porque_no_escribe(api, audit_calls):
    app, db, *_ = api
    call(app, "POST /api/tarifas/batch", body={"queries": [{"table": "tarifas_zone_groups"}]})
    assert not [c for c in audit_calls if c[0] in ("bind", "clear")]


def test_batch_respeta_la_lista_blanca_y_el_filtro_de_paises(api, caller_permissions):
    app, db, *_ = api
    caller_permissions.set(make_permissions({"tarifas": ["view"]}, countries=(CR,)))
    call(app, "POST /api/tarifas/batch", body={"queries": [{"table": "tarifas_settlements"}]})
    assert "country_id = ANY" in db.calls[0][0] and db.calls[0][1] == [[CR]]

    bad = call(app, "POST /api/tarifas/batch", body={"queries": [{"table": "usuarios_secretos"}]})
    assert bad["statusCode"] in (400, 404)


def test_batch_exige_poder_leer(api, caller_permissions):
    app, db, *_ = api
    caller_permissions.set(make_permissions({"guias": ["view"]}))
    response = call(app, "POST /api/tarifas/batch", body={"queries": [{"table": "tarifas_zone_groups"}]})
    assert response["statusCode"] == 403 and db.calls == []


@pytest.mark.parametrize("body", [{}, {"queries": []}, {"queries": "x"}, {"queries": ["x"]}])
def test_batch_valida_la_forma(api, body):
    app, db, *_ = api
    assert call(app, "POST /api/tarifas/batch", body=body)["statusCode"] == 400
    assert db.calls == []


def test_batch_tiene_tope(api):
    app, db, *_ = api
    body = {"queries": [{"table": "tarifas_zone_groups"}] * (app.MAX_BATCH + 1)}
    assert call(app, "POST /api/tarifas/batch", body=body)["statusCode"] == 400
    assert db.calls == []


# ── /{table}/find ──────────────────────────────────────────────────────────────────────────────

def test_find_por_post_equivale_al_get_con_q_en_el_cuerpo(api, audit_calls):
    app, db, *_ = api
    q = {"where": [{"column": "status", "op": "eq", "value": "completed"}], "limit": 10}
    response = call(app, "POST /api/tarifas/{table}/find", path={"table": "tarifas_v_viajes"}, body=q)

    assert response["statusCode"] == 200 and body_of(response) == [{"id": "x"}]
    sql, params = db.calls[-1]
    assert 'FROM "tarifas_v_viajes"' in sql and "LIMIT 10" in sql and params == ["completed"]
    assert not [c for c in audit_calls if c[0] == "bind"]


def test_find_por_post_soporta_in_con_miles_de_ids(api):
    app, db, *_ = api
    ids = [f"id-{n}" for n in range(3000)]
    call(app, "POST /api/tarifas/{table}/find", path={"table": "tarifas_settlements"},
         body={"where": [{"column": "trip_id", "op": "in", "value": ids}]})
    assert db.calls[-1][1] == [ids]


# ── Paginación por cursor ──────────────────────────────────────────────────────────────────────

def test_after_descendente_compara_la_tupla_con_menor_que(api):
    app, db, *_ = api
    q = {"orderBy": [{"column": "settlement_date", "direction": "desc"}, {"column": "number", "direction": "desc"}],
         "after": {"settlement_date": "2026-08-28", "number": "LIQ-VE-010"}, "limit": 50}
    call(app, "GET /api/tarifas/{table}", path={"table": "tarifas_settlements"}, query={"q": json.dumps(q)})
    sql, params = db.calls[-1]
    assert '("settlement_date", "number") < (%s::text, %s::text)' in sql
    assert params == ["2026-08-28", "LIQ-VE-010"]
    assert 'ORDER BY "settlement_date" DESC NULLS LAST, "number" DESC NULLS LAST' in sql


def test_after_ascendente_usa_mayor_que(api):
    app, db, *_ = api
    q = {"orderBy": [{"column": "number"}], "after": {"number": "LIQ-VE-010"}}
    call(app, "GET /api/tarifas/{table}", path={"table": "tarifas_settlements"}, query={"q": json.dumps(q)})
    assert '("number") > (%s::text)' in db.calls[-1][0]


@pytest.mark.parametrize("q", [
    {"after": {"number": "x"}},  # sin orderBy
    {"orderBy": [{"column": "number"}], "after": {"otra": "x"}},  # columnas distintas
    {"orderBy": [{"column": "settlement_date", "direction": "desc"}, {"column": "number"}],
     "after": {"settlement_date": "2026-01-01", "number": "x"}},  # direcciones mezcladas
    {"orderBy": [{"column": "number"}], "after": {"number": None}},  # NULL
    {"orderBy": [{"column": "number"}], "after": []},
])
def test_after_invalido_es_400(api, q):
    app, db, *_ = api
    response = call(app, "GET /api/tarifas/{table}", path={"table": "tarifas_settlements"}, query={"q": json.dumps(q)})
    assert response["statusCode"] == 400 and db.calls == []


# ── Métricas ───────────────────────────────────────────────────────────────────────────────────

def test_cada_request_imprime_una_linea_emf_con_duracion_y_sentencias(api, capsys):
    app, db, *_ = api
    call(app, "POST /api/tarifas/batch", body={"queries": [{"table": "tarifas_zone_groups"}, {"table": "zones"}]})
    lines = [json.loads(line) for line in capsys.readouterr().out.splitlines() if line.startswith("{")]
    line = lines[-1]
    assert line["Route"] == "POST /api/tarifas/batch" and line["Status"] == 200
    assert line["Queries"] == 2 and line["Errors"] == 0 and line["DurationMs"] >= 0
    assert line["_aws"]["CloudWatchMetrics"][0]["Namespace"] == "TMS/Tarifas"


def test_el_primer_request_marca_arranque_en_frio_y_los_demas_no(api, capsys):
    app, db, metrics, _ = api
    metrics._cold_start = True
    call(app, "POST /api/tarifas/batch", body={"queries": [{"table": "tarifas_zone_groups"}]})
    call(app, "POST /api/tarifas/batch", body={"queries": [{"table": "tarifas_zone_groups"}]})
    lines = [json.loads(line) for line in capsys.readouterr().out.splitlines() if line.startswith("{")]
    assert [l["ColdStart"] for l in lines[-2:]] == [1, 0]


def test_un_error_5xx_cuenta_como_error(api, capsys):
    app, db, *_ = api
    db.error = RuntimeError("boom")
    call(app, "GET /api/tarifas/{table}", path={"table": "tarifas_zone_groups"})
    line = [json.loads(l) for l in capsys.readouterr().out.splitlines() if l.startswith("{")][-1]
    assert line["Status"] == 500 and line["Errors"] == 1


# ── Topes de tiempo de sentencia ───────────────────────────────────────────────────────────────

def test_sin_variables_de_entorno_no_se_toca_la_conexion(api, monkeypatch):
    app, db, _, tdb = api
    monkeypatch.delenv("TMS_STATEMENT_TIMEOUT_MS", raising=False)
    monkeypatch.setattr(pg, "_live_connection", lambda: pytest.fail("no debía abrir la conexión"), raising=False)
    tdb.query("SELECT 1")
    assert db.calls == [("SELECT 1", [])]


def test_con_tope_se_fija_una_vez_por_conexion(api, monkeypatch):
    app, db, _, tdb = api
    monkeypatch.setenv("TMS_STATEMENT_TIMEOUT_MS", "10000")
    monkeypatch.setenv("TMS_LOCK_TIMEOUT_MS", "5000")
    sets, connection = [], object()
    monkeypatch.setattr(pg, "_live_connection", lambda: connection, raising=False)
    monkeypatch.setattr(pg, "_run", lambda c, sql, params: sets.append((sql, params)) or [], raising=False)

    tdb.query("SELECT 1")
    tdb.query("SELECT 2")
    assert len(sets) == 1 and sets[0][1] == ["10000", "5000"] and "set_config" in sets[0][0]

    connection_2 = object()  # el contenedor reconectó: hay que volver a fijarlo
    monkeypatch.setattr(pg, "_live_connection", lambda: connection_2, raising=False)
    tdb.query("SELECT 3")
    assert len(sets) == 2


def test_una_sentencia_cancelada_por_tiempo_es_504_con_mensaje_claro(api):
    app, db, *_ = api
    db.error = HttpError(500, "canceling statement due to statement timeout")
    response = call(app, "GET /api/tarifas/{table}", path={"table": "tarifas_zone_groups"})
    assert response["statusCode"] == 504
    assert "demasiado" in body_of(response)["error"]["message"]
