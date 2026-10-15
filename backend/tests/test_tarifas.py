"""API del tarifador (/api/tarifas/*): el backend del ORM del frontend.

Sin BD: pg.query y pg.transaction se reemplazan y se inspecciona el SQL.
"""

import json
from contextlib import contextmanager

import pytest

from conftest import body_of, http_event, load_stack_module, make_permissions
from tms_common import pg
from tms_common.errors import HttpError

# CA autofirmada solo para este test (sin llave privada).
TEST_CA = """-----BEGIN CERTIFICATE-----
MIIDBTCCAe2gAwIBAgIUOFz31XjudpJmJ/yAz71dVY4kgiQwDQYJKoZIhvcNAQEL
BQAwEjEQMA4GA1UEAwwHdGVzdC1jYTAeFw0yNjEwMDUxMzUwMDBaFw0zNjEwMDIx
MzUwMDBaMBIxEDAOBgNVBAMMB3Rlc3QtY2EwggEiMA0GCSqGSIb3DQEBAQUAA4IB
DwAwggEKAoIBAQCeAvu91ZUyVgBGJGYiRIp3afOpLo964vZ851/Oj/4jY0R3co+A
3osw5RVQ56SO0fOUs7QbmQCu/qA0l21Bo8mRqlajdeQYO1H/VQ/hudaakNwrPXqv
QbXtvKeoehbla/Iu4BIhtG70gVfQ0QWV6xjc2Sz36mG/V+GySy6xL1Ht8gUmqsGp
G1552GV2qHeClj+oqkgoyTF4uaSnXaEDFBxBgq0DE98x5+fS+ZaPEdkcQpALxEyn
/Jq+JqzEkwes+HgYmiDDZ9eL9ivKs7aV4FJOH6d0IFDDEsaYbUgmwfmHHmfqEntO
hl/XMqndSGctTeB1qpUmwGEaarHE1dOq51tRAgMBAAGjUzBRMB0GA1UdDgQWBBR3
gcbcANy/4cWcXl5avvGozYErMzAfBgNVHSMEGDAWgBR3gcbcANy/4cWcXl5avvGo
zYErMzAPBgNVHRMBAf8EBTADAQH/MA0GCSqGSIb3DQEBCwUAA4IBAQAiZmoU+BeQ
5psmoxYIZ2Jsw0U4EkqqzyckoI+EF4Skl9qoDsTdIRVqvNNY81NTfL2HmR/52TAM
PLAtNkhhpqhiq2aQBCOhSeXKeUtHZz6dnWYMaYbZ71Uzw2dHe/CkU9RAle3sMBP/
YYobCje0AUD6hDDiiWvk81VOiYLFCEcVc4F2E62aYtP8Qjl1ozCBE8xtA9t5ddt5
43LuwmoFAfgmEsWZhdILFhV2RdgM3vQA1FuM2IYTuNkStiXXza9Bw0IT+b0kvn28
2Iddm3weAb2gPakDHikhL07BOhbrWnTHedWgR3Mz97rJ2XQisBrh9rUCWCohlPsN
FUagDTD3dLz8
-----END CERTIFICATE-----
"""

USER = {"id": "auth-1", "email": "liquidador@ologistics.com"}
CR = "22222222-2222-2222-2222-222222222221"


class FakeDb:
    def __init__(self):
        self.calls = []          # (sql, params) de pg.query
        self.tx_calls = []       # (sql, params) dentro de la transacción
        self.tx_state = None     # 'commit' | 'rollback'
        self.rows = [{"id": "x"}]
        self.error = None

    def query(self, sql, params=()):
        self.calls.append((sql, list(params)))
        if self.error:
            raise self.error
        return self.rows

    @contextmanager
    def transaction(self):
        def run(sql, params=()):
            self.tx_calls.append((sql, list(params)))
            return self.rows
        try:
            yield run
            self.tx_state = "commit"
        except BaseException:
            self.tx_state = "rollback"
            raise


@pytest.fixture
def api(monkeypatch):
    db = FakeDb()
    monkeypatch.setattr(pg, "query", db.query)
    monkeypatch.setattr(pg, "transaction", db.transaction)
    return load_stack_module("tarifas"), db


def call(app, route, *, path=None, query=None, body=None):
    return app.handler(http_event(route, path=path, query=query, body=body, user=USER), None)


# ── Lectura ────────────────────────────────────────────────────────────────────────────────────

def test_lista_viajes_desde_la_vista_con_filtro_orden_y_limite(api):
    app, db = api
    q = {"where": [{"column": "status", "op": "eq", "value": "completed"},
                   {"column": "settlement_id", "op": "isNull"}],
         "orderBy": [{"column": "route_date", "direction": "desc"}], "limit": 50}
    response = call(app, "GET /api/tarifas/{table}", path={"table": "tarifas_v_viajes"}, query={"q": json.dumps(q)})

    assert response["statusCode"] == 200
    assert body_of(response) == [{"id": "x"}]  # el contrato devuelve el array crudo
    sql, params = db.calls[-1]
    assert 'FROM "tarifas_v_viajes"' in sql
    assert '"status" = %s::text' in sql and '"settlement_id" IS NULL' in sql
    assert 'ORDER BY "route_date" DESC NULLS LAST' in sql and "LIMIT 50" in sql
    assert params == ["completed"]


def test_neq_e_in_tienen_la_semantica_del_driver_json(api):
    app, db = api
    q = {"where": [{"column": "status", "op": "neq", "value": "Anulado"},
                   {"column": "trip_id", "op": "in", "value": ["a", "b"]}]}
    call(app, "GET /api/tarifas/{table}", path={"table": "tarifas_settlements"}, query={"q": json.dumps(q)})
    sql, params = db.calls[-1]
    assert '"status" IS DISTINCT FROM %s::text' in sql
    assert '"trip_id" = ANY(%s::uuid[])' in sql
    assert params == ["Anulado", ["a", "b"]]


def test_in_vacio_no_trae_nada(api):
    app, db = api
    q = {"where": [{"column": "trip_id", "op": "in", "value": []}]}
    call(app, "GET /api/tarifas/{table}", path={"table": "tarifas_settlements"}, query={"q": json.dumps(q)})
    assert "WHERE FALSE" in db.calls[-1][0]


def test_el_limite_tiene_tope(api):
    app, db = api
    call(app, "GET /api/tarifas/{table}", path={"table": "tarifas_settlements"}, query={"q": json.dumps({"limit": 999999})})
    assert "LIMIT 5000" in db.calls[-1][0]


def test_columnas_proyecta_solo_las_pedidas_y_las_valida(api):
    app, db = api
    q = {"where": [{"column": "country_id", "op": "eq", "value": "CR"}], "columns": ["number", "number", "id"]}
    call(app, "GET /api/tarifas/{table}", path={"table": "tarifas_settlements"}, query={"q": json.dumps(q)})
    assert db.calls[-1][0].startswith('SELECT "number", "id" FROM "tarifas_settlements"')


@pytest.mark.parametrize("columns", [[], "number", [1], ["no_existe"], ["id; drop table x"]])
def test_columnas_invalidas_son_400(api, columns):
    app, db = api
    q = {"columns": columns}
    response = call(app, "GET /api/tarifas/{table}", path={"table": "tarifas_settlements"}, query={"q": json.dumps(q)})
    assert response["statusCode"] == 400
    assert db.calls == []


def test_un_rol_acotado_solo_ve_sus_paises(api, caller_permissions):
    app, db = api
    caller_permissions.set(make_permissions({"tarifas": ["view"]}, countries=(CR,)))
    call(app, "GET /api/tarifas/{table}", path={"table": "tarifas_v_viajes"})
    sql, params = db.calls[-1]
    assert "country_id = ANY(%s::uuid[])" in sql and params == [[CR]]


def test_transportistas_sin_pais_los_ve_un_rol_acotado(api, caller_permissions):
    app, db = api
    caller_permissions.set(make_permissions({"tarifas": ["view"]}, countries=(CR,)))
    call(app, "GET /api/tarifas/{table}", path={"table": "carriers"})
    assert "(country_id IS NULL OR country_id = ANY(%s::uuid[]))" in db.calls[-1][0]


def test_obtener_uno_y_404(api):
    app, db = api
    ok = call(app, "GET /api/tarifas/{table}/{id}", path={"table": "tarifas_v_viajes", "id": "v1"})
    assert ok["statusCode"] == 200 and body_of(ok) == {"id": "x"}
    db.rows = []
    missing = call(app, "GET /api/tarifas/{table}/{id}", path={"table": "tarifas_v_viajes", "id": "v1"})
    assert missing["statusCode"] == 404


@pytest.mark.parametrize("table,q,status", [
    ("no_existe", None, 404),
    ("tarifas_settlements", {"where": [{"column": "no_existe", "op": "eq", "value": 1}]}, 400),
    ("tarifas_settlements", {"where": [{"column": "status", "op": "LIKE", "value": "x"}]}, 400),
    ("tarifas_settlements", {"orderBy": [{"column": "x; drop table"}]}, 400),
    ("tarifas_settlements", {"limit": -1}, 400),
])
def test_lista_blanca(api, table, q, status):
    app, db = api
    query = {"q": json.dumps(q)} if q is not None else None
    assert call(app, "GET /api/tarifas/{table}", path={"table": table}, query=query)["statusCode"] == status
    assert db.calls == []


def test_leer_exige_view_en_tarifas(api, caller_permissions):
    app, db = api
    caller_permissions.set(make_permissions({"guias": ["view"]}))
    assert call(app, "GET /api/tarifas/{table}", path={"table": "tarifas_v_viajes"})["statusCode"] == 403


# ── Escrituras ─────────────────────────────────────────────────────────────────────────────────

def test_insert_genera_id_con_prefijo_y_serializa_jsonb(api):
    app, db = api
    body = {"country_id": CR, "trip_id": "v1", "status": "Borrador", "trace": [{"seq": 1}]}
    response = call(app, "POST /api/tarifas/{table}", path={"table": "tarifas_settlements"}, body=body)
    assert response["statusCode"] == 200
    sql, params = db.calls[-1]
    assert sql.startswith('INSERT INTO "tarifas_settlements"')
    assert "%s::jsonb" in sql and "%s::uuid" in sql
    assert json.dumps([{"seq": 1}]) in params
    assert any(isinstance(p, str) and p.startswith("stl_") for p in params)


@pytest.mark.parametrize("route,path", [
    ("POST /api/tarifas/{table}", {"table": "tarifas_v_viajes"}),
    ("PATCH /api/tarifas/{table}/{id}", {"table": "carriers", "id": "c1"}),
    ("DELETE /api/tarifas/{table}/{id}", {"table": "drivers", "id": "d1"}),
    ("PATCH /api/tarifas/{table}/{id}", {"table": "tarifas_audit_log", "id": "a1"}),
    ("DELETE /api/tarifas/{table}/{id}", {"table": "tarifas_audit_log", "id": "a1"}),
])
def test_externas_y_bitacora_son_405(api, route, path):
    app, db = api
    response = call(app, route, path=path, body={"name": "x"})
    assert response["statusCode"] == 405
    assert db.calls == []


def test_la_bitacora_si_acepta_insert(api):
    app, _ = api
    response = call(app, "POST /api/tarifas/{table}", path={"table": "tarifas_audit_log"},
                    body={"entity": "settlement", "entity_id": "s1", "action": "CREATE"})
    assert response["statusCode"] == 200


def test_escribir_exige_la_accion_en_tarifas(api, caller_permissions):
    app, db = api
    caller_permissions.set(make_permissions({"tarifas": ["view"]}))
    response = call(app, "POST /api/tarifas/{table}", path={"table": "tarifas_party_variables"}, body={"key": "custom:x"})
    assert response["statusCode"] == 403 and db.calls == []


def test_quien_liquida_escribe_liquidaciones_pero_no_configuracion(api, caller_permissions):
    app, db = api
    caller_permissions.set(make_permissions({"tarifas": ["view", "create", "edit"]}))
    ok = call(app, "POST /api/tarifas/{table}", path={"table": "tarifas_settlements"}, body={"status": "Borrador"})
    assert ok["statusCode"] == 200
    llamadas = len(db.calls)
    for tabla in ("tarifas_pricing_rules", "tarifas_cost_structures", "tarifas_rate_tables", "tarifas_margin_policies"):
        r = call(app, "POST /api/tarifas/{table}", path={"table": tabla}, body={"code": "x"})
        assert r["statusCode"] == 403, tabla
        r = call(app, "PATCH /api/tarifas/{table}/{id}", path={"table": tabla, "id": "x"}, body={"code": "y"})
        assert r["statusCode"] == 403, tabla
    assert len(db.calls) == llamadas  # ninguna escritura de configuración llegó a la base


def test_configurar_exige_tarifas_config(api, caller_permissions):
    app, db = api
    caller_permissions.set(make_permissions({"tarifas.config": ["view", "create", "edit", "delete"]}))
    r = call(app, "POST /api/tarifas/{table}", path={"table": "tarifas_pricing_rules"}, body={"code": "R1"})
    assert r["statusCode"] == 200
    # ...pero eso solo no permite emitir liquidaciones.
    r = call(app, "POST /api/tarifas/{table}", path={"table": "tarifas_settlements"}, body={"status": "Borrador"})
    assert r["statusCode"] == 403


def test_leer_sirve_con_cualquiera_de_los_dos_modulos(api, caller_permissions):
    app, _db = api
    for modulos in ({"tarifas": ["view"]}, {"tarifas.config": ["view"]}):
        caller_permissions.set(make_permissions(modulos))
        assert call(app, "GET /api/tarifas/{table}", path={"table": "tarifas_pricing_rules"})["statusCode"] == 200
    caller_permissions.set(make_permissions({"guias": ["view"]}))
    assert call(app, "GET /api/tarifas/{table}", path={"table": "tarifas_pricing_rules"})["statusCode"] == 403


def test_la_transaccion_valida_el_modulo_de_cada_operacion(api, caller_permissions):
    app, db = api
    caller_permissions.set(make_permissions({"tarifas": ["view", "create", "edit"]}))
    ops = [{"op": "update", "table": "tarifas_settlements", "id": "s1", "values": {"status": "Anulado"}},
           {"op": "insert", "table": "tarifas_pricing_rules", "values": {"code": "X"}}]
    r = call(app, "POST /api/tarifas/tx", body={"ops": ops})
    assert r["statusCode"] == 403 and db.tx_calls == []
    ok = call(app, "POST /api/tarifas/tx", body={"ops": ops[:1]})
    assert ok["statusCode"] == 200


def test_no_se_escribe_en_un_pais_ajeno(api, caller_permissions):
    app, db = api
    caller_permissions.set(make_permissions({"tarifas": "*"}, countries=(CR,)))
    response = call(app, "POST /api/tarifas/{table}", path={"table": "tarifas_settlements"},
                    body={"country_id": "otro-pais", "status": "Borrador"})
    assert response["statusCode"] == 403 and db.calls == []


def test_update_no_cambia_el_id_y_404_si_no_existe(api):
    app, db = api
    call(app, "PATCH /api/tarifas/{table}/{id}", path={"table": "tarifas_settlements", "id": "s1"},
         body={"id": "otro", "status": "Anulado"})
    sql, params = db.calls[-1]
    assert sql.startswith('UPDATE "tarifas_settlements" SET "status" = %s::text WHERE "id" = %s::text')
    # La transición se valida en el propio UPDATE: último parámetro = estados de origen permitidos.
    assert params[:2] == ["Anulado", "s1"]
    assert params[2] == ["Borrador", "En Revisión", "Aprobado", "Pagado"]

    db.rows = []
    # Sin fila afectada: no existe o el estado actual no permite el cambio -> 409 (no 404 a secas).
    assert call(app, "PATCH /api/tarifas/{table}/{id}", path={"table": "tarifas_settlements", "id": "s1"},
                body={"status": "Anulado"})["statusCode"] == 409
    # Una fila de otra tabla sigue dando 404.
    assert call(app, "PATCH /api/tarifas/{table}/{id}", path={"table": "tarifas_pricing_rules", "id": "r1"},
                body={"name": "x"})["statusCode"] == 404


def test_la_bitacora_toma_el_actor_del_token_no_del_cliente(api):
    app, db = api
    falso = {"entity": "settlement", "entity_id": "s1", "action": "CREATE",
             "user_name": "otro@falso.com", "role": "Administrador", "created_at": "2026-10-15T00:00:00Z"}
    call(app, "POST /api/tarifas/{table}", path={"table": "tarifas_audit_log"}, body=falso)
    sql, params = db.calls[-1]
    cols = [c.strip().strip('"') for c in sql.split("(", 1)[1].split(")", 1)[0].split(",")]
    sent = dict(zip(cols, params))
    assert sent["user_name"] == "liquidador@ologistics.com"
    assert sent["role"] == "Admin"  # el rol del fixture por defecto, no el "Administrador" que mandó el cliente

    # También dentro de una transacción (insert e insert_many).
    ops = [{"op": "insert", "table": "tarifas_audit_log", "values": falso},
           {"op": "insert_many", "table": "tarifas_audit_log", "rows": [falso, falso]}]
    assert call(app, "POST /api/tarifas/tx", body={"ops": ops})["statusCode"] == 200
    for _, tx_params in db.tx_calls:
        assert "otro@falso.com" not in tx_params and "Administrador" not in tx_params
        assert "Admin" in tx_params
        assert "liquidador@ologistics.com" in tx_params


def test_una_lectura_recortada_por_el_tope_lo_avisa(api):
    app, db = api
    db.rows = [{"id": str(i)} for i in range(5000)]
    r = call(app, "GET /api/tarifas/{table}", path={"table": "tarifas_settlements"})
    assert r["statusCode"] == 200
    assert r["headers"]["X-Tarifas-Truncated"] == "tarifas_settlements"
    # Con un limit explícito por debajo del tope no es truncado, aunque devuelva muchas filas.
    r = call(app, "GET /api/tarifas/{table}", path={"table": "tarifas_settlements"}, query={"q": json.dumps({"limit": 10})})
    assert "X-Tarifas-Truncated" not in r["headers"]
    # /batch conserva la forma de lista de resultados.
    r = call(app, "POST /api/tarifas/batch", body={"queries": [{"table": "tarifas_settlements"}]})
    assert len(json.loads(r["body"])) == 1 and r["headers"]["X-Tarifas-Truncated"] == "tarifas_settlements"


def test_un_rol_acotado_no_crea_ni_vuelve_global_una_fila(api, caller_permissions):
    app, db = api
    caller_permissions.set(make_permissions({"tarifas.config": ["view", "create", "edit"]}, countries=(CR,)))
    table = {"table": "tarifas_pricing_rules"}
    # Sin país (= regla global) o con country_id null explícito: 403.
    assert call(app, "POST /api/tarifas/{table}", path=table, body={"name": "x"})["statusCode"] == 403
    assert call(app, "PATCH /api/tarifas/{table}/{id}", path={**table, "id": "r1"},
                body={"country_id": None})["statusCode"] == 403
    # Con su país, bien; y editar otros campos sin tocar country_id también.
    assert call(app, "POST /api/tarifas/{table}", path=table,
                body={"name": "x", "country_id": CR})["statusCode"] == 200
    assert call(app, "PATCH /api/tarifas/{table}/{id}", path={**table, "id": "r1"},
                body={"name": "y"})["statusCode"] == 200


def test_una_liquidacion_emitida_es_inmutable_salvo_su_estado(api):
    app, db = api
    before = len(db.calls)
    for body in ({"total_amount": "1.00"}, {"trace": []}, {"status": "Anulado", "number": "LIQ-X-1"}):
        r = call(app, "PATCH /api/tarifas/{table}/{id}", path={"table": "tarifas_settlements", "id": "s1"}, body=body)
        assert r["statusCode"] == 403
    assert len(db.calls) == before  # ni siquiera llegó a la base


def test_la_transicion_se_valida_en_el_update(api):
    app, db = api
    call(app, "PATCH /api/tarifas/{table}/{id}", path={"table": "tarifas_settlements", "id": "s1"},
         body={"status": "Aprobado"})
    sql, params = db.calls[-1]
    assert 'AND "status" = ANY(%s::text[]) AND "superseded_by" IS NULL' in sql
    assert params[2] == ["Borrador", "En Revisión"]
    # Anular no exige que no haya sido reemplazada.
    call(app, "PATCH /api/tarifas/{table}/{id}", path={"table": "tarifas_settlements", "id": "s1"},
         body={"status": "Anulado"})
    assert '"superseded_by" IS NULL' not in db.calls[-1][0]
    r = call(app, "PATCH /api/tarifas/{table}/{id}", path={"table": "tarifas_settlements", "id": "s1"},
             body={"status": "Inventado"})
    assert r["statusCode"] == 400


def test_la_transaccion_tambien_protege_la_liquidacion(api):
    app, db = api
    ops = [{"op": "update", "table": "tarifas_settlements", "id": "s1", "values": {"total_amount": "9"}}]
    assert call(app, "POST /api/tarifas/tx", body={"ops": ops})["statusCode"] == 403
    assert db.tx_state is None


def test_delete_es_204(api):
    app, db = api
    response = call(app, "DELETE /api/tarifas/{table}/{id}", path={"table": "tarifas_rate_table_rows", "id": "r1"})
    assert response["statusCode"] == 204
    assert db.calls[-1][0].startswith('DELETE FROM "tarifas_rate_table_rows"')


def test_integridad_llega_como_409_con_el_sqlstate(api):
    app, db = api
    db.error = HttpError(409, "duplicate key value violates unique constraint", code="23505")
    response = call(app, "POST /api/tarifas/{table}", path={"table": "tarifas_settlements"}, body={"status": "Borrador"})
    assert response["statusCode"] == 409
    assert body_of(response)["error"] == {"message": "duplicate key value violates unique constraint", "code": "23505"}


# ── Transacción ────────────────────────────────────────────────────────────────────────────────

def test_transaccion_anular_y_emitir_en_orden(api):
    app, db = api
    ops = [{"op": "update", "table": "tarifas_settlements", "id": "s1", "values": {"status": "Anulado", "superseded_by": "s2"}},
           {"op": "insert", "table": "tarifas_settlements", "values": {"id": "s2", "status": "Borrador"}}]
    response = call(app, "POST /api/tarifas/tx", body={"ops": ops})
    assert response["statusCode"] == 200
    assert db.tx_state == "commit"
    assert [sql.split(" ", 1)[0] for sql, _ in db.tx_calls] == ["UPDATE", "INSERT"]


def test_transaccion_valida_todo_antes_de_tocar_la_bd(api):
    app, db = api
    ops = [{"op": "insert", "table": "tarifas_settlements", "values": {"status": "Borrador"}},
           {"op": "update", "table": "tarifas_v_viajes", "id": "v1", "values": {"status": "x"}}]
    response = call(app, "POST /api/tarifas/tx", body={"ops": ops})
    assert response["statusCode"] == 405
    assert db.tx_calls == [] and db.tx_state is None


def test_transaccion_sin_la_fila_hace_rollback(api):
    app, db = api
    db.rows = []
    ops = [{"op": "update", "table": "tarifas_settlements", "id": "s1", "values": {"status": "Anulado"}}]
    response = call(app, "POST /api/tarifas/tx", body={"ops": ops})
    assert response["statusCode"] == 404
    assert db.tx_state == "rollback"


def test_transaccion_se_repite_ante_deadlock(api, monkeypatch):
    app, db = api
    monkeypatch.setattr(pg.time, "sleep", lambda _s: None)
    real = db.transaction
    attempts = []

    @contextmanager
    def flaky():
        attempts.append(1)
        with real() as run:
            if len(attempts) == 1:
                raise HttpError(500, "deadlock detected", code="40P01")
            yield run

    monkeypatch.setattr(pg, "transaction", flaky)
    ops = [{"op": "update", "table": "tarifas_settlements", "id": "s1", "values": {"status": "Anulado"}}]
    response = call(app, "POST /api/tarifas/tx", body={"ops": ops})
    assert response["statusCode"] == 200
    assert len(attempts) == 2 and db.tx_state == "commit"


def test_transaccion_no_repite_errores_de_integridad(api, monkeypatch):
    app, db = api
    attempts = []

    @contextmanager
    def failing():
        attempts.append(1)
        raise HttpError(409, "llave duplicada", code="23505")
        yield  # pragma: no cover

    monkeypatch.setattr(pg, "transaction", failing)
    ops = [{"op": "update", "table": "tarifas_settlements", "id": "s1", "values": {"status": "Anulado"}}]
    response = call(app, "POST /api/tarifas/tx", body={"ops": ops})
    assert response["statusCode"] == 409
    assert len(attempts) == 1


def test_transaccion_agota_los_reintentos(api, monkeypatch):
    app, db = api
    monkeypatch.setattr(pg.time, "sleep", lambda _s: None)
    attempts = []

    @contextmanager
    def always_deadlock():
        attempts.append(1)
        raise HttpError(500, "deadlock detected", code="40P01")
        yield  # pragma: no cover

    monkeypatch.setattr(pg, "transaction", always_deadlock)
    ops = [{"op": "update", "table": "tarifas_settlements", "id": "s1", "values": {"status": "Anulado"}}]
    response = call(app, "POST /api/tarifas/tx", body={"ops": ops})
    assert response["statusCode"] == 500
    assert len(attempts) == 1 + app.TX_RETRIES


def test_ssl_valida_el_servidor_solo_con_tms_db_ssl_ca(monkeypatch, tmp_path):
    import ssl
    monkeypatch.delenv("TMS_DB_SSL_CA", raising=False)
    default = pg._ssl_context()
    assert default.verify_mode == ssl.CERT_NONE and default.check_hostname is False

    pem = tmp_path / "ca.pem"
    pem.write_text(TEST_CA)
    monkeypatch.setenv("TMS_DB_SSL_CA", str(pem))
    strict = pg._ssl_context()
    assert strict.verify_mode == ssl.CERT_REQUIRED and strict.check_hostname is True


@pytest.mark.parametrize("body", [{}, {"ops": []}, {"ops": [{"op": "truncate", "table": "tarifas_settlements"}]},
                                  {"ops": [{"op": "delete", "table": "tarifas_settlements"}]}])
def test_transaccion_mal_formada_es_400(api, body):
    app, _ = api
    assert call(app, "POST /api/tarifas/tx", body=body)["statusCode"] == 400


# ── El manifiesto es el del frontend ───────────────────────────────────────────────────────────

def test_el_manifiesto_marca_las_externas_como_solo_lectura():
    schema = load_stack_module("tarifas", "tarifas_schema")
    tables = schema.load_manifest()
    assert tables["tarifas_v_viajes"].read_only and tables["carriers"].read_only
    assert not tables["tarifas_settlements"].read_only
    assert tables["tarifas_audit_log"].append_only
    assert tables["tarifas_settlements"].column_type("trip_id") == "uuid"


# ── tms_common: el SQLSTATE viaja hasta la respuesta ──────────────────────────────────────────

def test_pg_conserva_el_sqlstate_de_integridad():
    import pg8000.dbapi
    err = pg8000.dbapi.DatabaseError({"C": "23503", "M": "viola la llave foránea"})
    translated = pg._database_error(err)
    assert (translated.status, translated.code) == (409, "23503")
    other = pg._database_error(pg8000.dbapi.DatabaseError({"C": "42P01", "M": "no existe"}))
    assert (other.status, other.code) == (500, None)


# ── Transacción: insert_many ───────────────────────────────────────────────────────────────────

def _fila(n, **extra):
    return {"table_id": "t1", "key": [f"Z{n}"], "amount": f"{n}.00", "row_order": n, **extra}


def test_insert_many_inserta_cientos_de_filas_en_una_sola_sentencia(api):
    app, db = api
    rows = [_fila(n) for n in range(1, 351)]
    response = call(app, "POST /api/tarifas/tx", body={"ops": [{"op": "insert_many", "table": "tarifas_rate_table_rows", "rows": rows}]})
    assert response["statusCode"] == 200
    assert db.tx_state == "commit"
    assert len(db.tx_calls) == 1
    sql, params = db.tx_calls[0]
    assert sql.startswith('INSERT INTO "tarifas_rate_table_rows"') and sql.endswith("RETURNING *")
    assert sql.count("(%s::") >= 350  # una tupla de placeholders por fila
    assert len(params) % 350 == 0 and len(params) // 350 == len(rows[0]) + 1  # + el id generado


def test_insert_many_conserva_el_orden_y_genera_los_ids(api):
    app, db = api
    rows = [_fila(n) for n in (3, 1, 2)]
    call(app, "POST /api/tarifas/tx", body={"ops": [{"op": "insert_many", "table": "tarifas_rate_table_rows", "rows": rows}]})
    sql, params = db.tx_calls[0]
    columns = [c.strip().strip('"') for c in sql.split("(", 1)[1].split(")", 1)[0].split(",")]
    width = len(columns)
    per_row = [params[i:i + width] for i in range(0, len(params), width)]
    order_index = columns.index("row_order")
    assert [row[order_index] for row in per_row] == [3, 1, 2]
    id_index = columns.index("id")
    ids = [row[id_index] for row in per_row]
    assert all(i.startswith("trow_") or "_" in i for i in ids) and len(set(ids)) == 3


def test_insert_many_parte_la_sentencia_si_cambian_las_columnas(api):
    app, db = api
    rows = [_fila(1), _fila(2), _fila(3, active=True), _fila(4, active=True), _fila(5)]
    call(app, "POST /api/tarifas/tx", body={"ops": [{"op": "insert_many", "table": "tarifas_rate_table_rows", "rows": rows}]})
    assert len(db.tx_calls) == 3
    assert [sql.count("(%s::") > 0 for sql, _ in db.tx_calls] == [True, True, True]


def test_insert_many_parte_por_tope_de_parametros(api, monkeypatch):
    app, db = api
    import tarifas_sql
    monkeypatch.setattr(tarifas_sql, "MAX_PARAMS", 20)
    rows = [_fila(n) for n in range(1, 11)]
    call(app, "POST /api/tarifas/tx", body={"ops": [{"op": "insert_many", "table": "tarifas_rate_table_rows", "rows": rows}]})
    assert len(db.tx_calls) > 1
    assert all(len(params) <= 20 for _, params in db.tx_calls)
    assert sum(len(params) for _, params in db.tx_calls) == sum(len(_fila(n)) + 1 for n in range(1, 11))


@pytest.mark.parametrize("rows", [[], None, "x", [{}], ["no es objeto"]])
def test_insert_many_rechaza_filas_invalidas(api, rows):
    app, db = api
    response = call(app, "POST /api/tarifas/tx", body={"ops": [{"op": "insert_many", "table": "tarifas_rate_table_rows", "rows": rows}]})
    assert response["statusCode"] == 400 and db.tx_calls == []


def test_insert_many_tiene_tope_de_filas(api):
    app, db = api
    rows = [_fila(n) for n in range(1, 5002)]
    response = call(app, "POST /api/tarifas/tx", body={"ops": [{"op": "insert_many", "table": "tarifas_rate_table_rows", "rows": rows}]})
    assert response["statusCode"] == 400 and db.tx_calls == []


def test_insert_many_valida_columnas_modulo_y_tablas_externas(api, caller_permissions):
    app, db = api
    ok_op = {"op": "insert_many", "table": "tarifas_rate_table_rows", "rows": [_fila(1, no_existe=1)]}
    assert call(app, "POST /api/tarifas/tx", body={"ops": [ok_op]})["statusCode"] == 400
    externa = {"op": "insert_many", "table": "tarifas_v_viajes", "rows": [{"status": "x"}]}
    assert call(app, "POST /api/tarifas/tx", body={"ops": [externa]})["statusCode"] == 405
    caller_permissions.set(make_permissions({"tarifas": ["view", "create"]}))
    sin_modulo = {"op": "insert_many", "table": "tarifas_rate_table_rows", "rows": [_fila(1)]}
    assert call(app, "POST /api/tarifas/tx", body={"ops": [sin_modulo]})["statusCode"] == 403
    assert db.tx_calls == []


def test_insert_many_no_escribe_en_un_pais_ajeno(api, caller_permissions):
    app, db = api
    caller_permissions.set(make_permissions({"tarifas.config": "*"}, countries=(CR,)))
    op = {"op": "insert_many", "table": "tarifas_pricing_rules", "rows": [{"code": "A", "country_id": CR}, {"code": "B", "country_id": "otro"}]}
    response = call(app, "POST /api/tarifas/tx", body={"ops": [op]})
    assert response["statusCode"] == 403 and db.tx_calls == []
