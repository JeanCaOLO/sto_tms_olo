"""Proformas del tarifador: decisiones por fase y protección de la API genérica."""

import json

import pytest

from conftest import body_of, http_event, load_stack_module, make_permissions
from test_tarifas import FakeDb, USER
from tms_common import pg

DECISION = "POST /api/tarifas/proformas/{id}/decision"
PROFORMA = {"id": "pro_1", "country_id": "22222222-2222-2222-2222-222222222221", "status": "En Revisión"}


def phase(pid, position, state="pendiente", role="Jefe", user=None):
    return {"id": pid, "position": position, "name": f"Fase {position}", "state": state,
            "approver_type": "user" if user else "role", "role_name": None if user else role, "user_id": user}


class Script(FakeDb):
    """Responde el SELECT de la proforma y el de sus fases; el resto devuelve una fila."""

    def __init__(self, proforma, phases, claim=None):
        super().__init__()
        self.proforma, self.phases, self.claim = proforma, phases, claim

    def query(self, sql, params=()):
        self.calls.append((sql, list(params)))
        if "FROM tarifas_proformas WHERE id" in sql:
            return [self.proforma] if self.proforma else []
        if "FROM tarifas_proforma_phases" in sql:
            return self.phases
        if "FROM tarifas_proforma_claims" in sql:
            return [self.claim] if self.claim else []
        return self.rows


@pytest.fixture
def api(monkeypatch):
    def build(proforma=PROFORMA, phases=None, claim=None):
        db = Script(proforma, phases if phases is not None else [phase("f1", 1), phase("f2", 2, role="Gerente")], claim)
        monkeypatch.setattr(pg, "query", db.query)
        monkeypatch.setattr(pg, "transaction", db.transaction)
        return load_stack_module("tarifas"), db
    return build


def decide(app, body):
    return app.handler(http_event(DECISION, path={"id": "pro_1"}, body=body, user=USER), None)


ADMIN_ROLES = {"SuperAdministrador", "SuperUsuario", "Administrador", "Admin"}  # como tms_common.permissions


def as_role(caller_permissions, role, modules=None):
    perms = make_permissions(modules or {"tarifas.proformas": "*"})
    caller_permissions.set(type(perms)(perms.app_user_id, perms.role_id, role, role in ADMIN_ROLES, perms.modules, True, ()))


def test_el_aprobador_del_rol_avanza_a_la_siguiente_fase(api, caller_permissions):
    app, db = api()
    as_role(caller_permissions, "Jefe")
    response = decide(app, {"action": "approve", "phaseId": "f1"})
    assert response["statusCode"] == 200
    assert body_of(response)["status"] == "En Revisión"
    assert db.tx_state == "commit"
    sql = " ".join(s for s, _ in db.tx_calls)
    assert "UPDATE tarifas_proforma_phases" in sql and "UPDATE tarifas_proformas" in sql and "tarifas_audit_log" in sql


def test_la_ultima_fase_aprobada_deja_la_proforma_aprobada(api, caller_permissions):
    app, db = api(phases=[phase("f1", 1, "aprobada"), phase("f2", 2, role="Gerente")])
    as_role(caller_permissions, "Gerente")
    response = decide(app, {"action": "approve", "phaseId": "f2"})
    assert body_of(response)["status"] == "Aprobado"
    status_update = next(p for s, p in db.tx_calls if s.startswith("UPDATE tarifas_proformas"))
    assert status_update[0] == "Aprobado"
    sync = next(p for s, p in db.tx_calls if s.startswith("UPDATE tarifas_settlements"))
    assert sync == ["Aprobado", "pro_1"]  # las liquidaciones siguen a la proforma


def test_otro_rol_o_fuera_de_turno_es_403_y_no_escribe(api, caller_permissions):
    app, db = api()
    as_role(caller_permissions, "Gerente")
    assert decide(app, {"action": "approve", "phaseId": "f2"})["statusCode"] == 403  # no es su turno
    assert decide(app, {"action": "approve", "phaseId": "f1"})["statusCode"] == 403  # no tiene el rol
    assert db.tx_calls == []


def test_fase_de_usuario_especifico_solo_lo_aprueba_ese_usuario(api, caller_permissions):
    app, db = api(phases=[phase("f1", 1, user="app-user")])
    as_role(caller_permissions, "Cualquiera")  # app_user_id de make_permissions = "app-user"
    assert decide(app, {"action": "approve", "phaseId": "f1"})["statusCode"] == 200
    app, db = api(phases=[phase("f1", 1, user="otro")])
    assert decide(app, {"action": "approve", "phaseId": "f1"})["statusCode"] == 403


def test_rechazar_exige_motivo_y_devuelve_a_borrador(api, caller_permissions):
    app, db = api()
    as_role(caller_permissions, "Jefe")
    assert decide(app, {"action": "reject", "phaseId": "f1"})["statusCode"] == 400
    response = decide(app, {"action": "reject", "phaseId": "f1", "comment": "montos mal"})
    assert body_of(response)["status"] == "Borrador"


def test_quitar_fase_solo_superadmin_con_motivo(api, caller_permissions):
    app, db = api()
    as_role(caller_permissions, "Jefe")
    assert decide(app, {"action": "skip", "phaseId": "f2", "comment": "urgente"})["statusCode"] == 403
    as_role(caller_permissions, "SuperAdministrador")
    assert decide(app, {"action": "skip", "phaseId": "f2"})["statusCode"] == 400
    assert decide(app, {"action": "skip", "phaseId": "f2", "comment": "urgente"})["statusCode"] == 200


def test_el_superadmin_no_aprueba_por_otros(api, caller_permissions):
    app, db = api()
    as_role(caller_permissions, "SuperAdministrador")
    assert decide(app, {"action": "approve", "phaseId": "f1"})["statusCode"] == 403


def test_anular_libera_las_liquidaciones_y_pide_motivo(api, caller_permissions):
    app, db = api()
    as_role(caller_permissions, "Jefe")
    assert decide(app, {"action": "annul"})["statusCode"] == 400
    response = decide(app, {"action": "annul", "comment": "error de transportista"})
    assert body_of(response)["status"] == "Anulado"
    assert any("tarifas_proforma_items SET state = 'excluded'" in s for s, _ in db.tx_calls)
    sync = next(p for s, p in db.tx_calls if s.startswith("UPDATE tarifas_settlements"))
    assert sync == ["Borrador", "pro_1"]


def test_una_proforma_anulada_no_admite_decisiones(api, caller_permissions):
    app, db = api(proforma={**PROFORMA, "status": "Anulado"})
    as_role(caller_permissions, "Jefe")
    assert decide(app, {"action": "approve", "phaseId": "f1"})["statusCode"] == 409


def test_sin_permiso_del_modulo_es_403(api, caller_permissions):
    app, db = api()
    as_role(caller_permissions, "Jefe", modules={"tarifas": "*"})
    assert decide(app, {"action": "approve", "phaseId": "f1"})["statusCode"] == 403


def test_reenviar_solo_tras_un_rechazo(api, caller_permissions):
    app, db = api(phases=[phase("f1", 1, "rechazada"), phase("f2", 2, "pendiente", role="Gerente")])
    as_role(caller_permissions, "Jefe")
    response = decide(app, {"action": "resubmit"})
    assert body_of(response)["status"] == "En Revisión"
    app, db = api()
    assert decide(app, {"action": "resubmit"})["statusCode"] == 409


# ── Verificación que pide la Lambda de envío (invocación directa, sin HTTP) ───────────────────────

def authorize(app, caller_permissions, monkeypatch):
    monkeypatch.setattr(app.proformas_api.permissions, "for_user", lambda uid: caller_permissions.value)
    return app.handler({"action": "authorize_send", "user_id": "auth-1", "proforma_id": "pro_1"}, None)


def test_envio_permitido_solo_si_esta_aprobada_y_con_permiso(api, caller_permissions, monkeypatch):
    app, db = api(proforma={**PROFORMA, "status": "Aprobado"})
    as_role(caller_permissions, "Liquidador")
    assert authorize(app, caller_permissions, monkeypatch) == {"ok": True}

    app, db = api()  # En Revisión
    result = authorize(app, caller_permissions, monkeypatch)
    assert result["ok"] is False and result["status"] == 409

    app, db = api(proforma={**PROFORMA, "status": "Aprobado"})
    as_role(caller_permissions, "Liquidador", modules={"tarifas": "*"})  # sin tarifas.proformas
    assert authorize(app, caller_permissions, monkeypatch)["status"] == 403


def test_envio_no_alcanza_proformas_de_otro_pais(api, caller_permissions, monkeypatch):
    app, db = api(proforma={**PROFORMA, "status": "Aprobado"})
    perms = make_permissions({"tarifas.proformas": "*"}, countries=("99999999-9999-9999-9999-999999999999",))
    caller_permissions.set(perms)
    result = authorize(app, caller_permissions, monkeypatch)
    assert result["ok"] is False and result["status"] == 404


def test_authorize_send_no_se_activa_por_http(api, caller_permissions):
    app, db = api(proforma={**PROFORMA, "status": "Aprobado"})
    as_role(caller_permissions, "Liquidador")
    response = app.handler(http_event("POST /api/tarifas/{table}", path={"table": "tarifas_proformas"},
                                      body={"action": "authorize_send"}, user=USER), None)
    assert "ok" not in (body_of(response) or {})


# ── La API genérica no se salta el flujo ───────────────────────────────────────────────────────

@pytest.mark.parametrize("route,path,body", [
    ("PATCH /api/tarifas/{table}/{id}", {"table": "tarifas_proforma_phases", "id": "f1"}, {"state": "aprobada"}),
    ("PATCH /api/tarifas/{table}/{id}", {"table": "tarifas_proformas", "id": "pro_1"}, {"status": "Aprobado"}),
    ("DELETE /api/tarifas/{table}/{id}", {"table": "tarifas_proformas", "id": "pro_1"}, None),
])
def test_la_api_generica_rechaza_cambios_de_flujo(api, route, path, body):
    app, db = api()
    response = app.handler(http_event(route, path=path, body=body, user=USER), None)
    assert response["statusCode"] == 405
    assert db.calls == []


def test_quien_liquida_puede_crear_y_sumar_a_proformas_pero_no_cambiar_fases(api, caller_permissions):
    app, db = api()
    as_role(caller_permissions, "Liquidador", modules={"tarifas": "*"})  # sin tarifas.proformas
    ok = app.handler(http_event("POST /api/tarifas/tx", body={"ops": [
        {"op": "insert", "table": "tarifas_proformas", "values": {"id": "pro_9", "status": "En Revisión"}},
        {"op": "insert", "table": "tarifas_proforma_items", "values": {"id": "pri_1", "proforma_id": "pro_9"}},
        {"op": "update", "table": "tarifas_proformas", "id": "pro_9", "values": {"total_amount": "10.00"}}]}, user=USER), None)
    assert ok["statusCode"] == 200
    phases = app.handler(http_event("POST /api/tarifas/tx", body={"ops": [
        {"op": "update", "table": "tarifas_proforma_phases", "id": "f1", "values": {"state": "aprobada"}}]}, user=USER), None)
    assert phases["statusCode"] == 405
    # sin ninguno de los dos módulos no escribe
    as_role(caller_permissions, "Chofer", modules={"tarifas.config": "*"})
    denied = app.handler(http_event("POST /api/tarifas/tx", body={"ops": [
        {"op": "insert", "table": "tarifas_proformas", "values": {"id": "pro_8"}}]}, user=USER), None)
    assert denied["statusCode"] == 403


def test_la_api_generica_si_permite_crear_y_editar_datos(api):
    app, db = api()
    ok = app.handler(http_event("PATCH /api/tarifas/{table}/{id}", path={"table": "tarifas_proformas", "id": "pro_1"},
                                body={"total_amount": "10.50"}, user=USER), None)
    assert ok["statusCode"] == 200
    tx = app.handler(http_event("POST /api/tarifas/tx", body={"ops": [
        {"op": "update", "table": "tarifas_proforma_phases", "id": "f1", "values": {"state": "aprobada"}}]}, user=USER), None)
    assert tx["statusCode"] == 405
    assert json.loads(tx["body"])


CLAIM = {"id": "prc_1", "phase_id": "f1", "status": "abierto", "reason": "montos mal"}
REJECTED = {**PROFORMA, "status": "Borrador"}


def tx_sql(db):
    return " ".join(s for s, _ in db.tx_calls)


def test_rechazar_abre_un_reclamo_con_el_motivo(api, caller_permissions):
    app, db = api()
    as_role(caller_permissions, "Jefe")
    assert decide(app, {"action": "reject", "phaseId": "f1", "comment": "montos mal"})["statusCode"] == 200
    insert = next(p for s, p in db.tx_calls if s.startswith("INSERT INTO tarifas_proforma_claims"))
    assert "montos mal" in insert and "f1" in insert and "Fase 1" in insert


def test_apelar_solo_liquidador_o_admin_y_devuelve_la_fase(api, caller_permissions):
    phases = [phase("f1", 1, "rechazada"), phase("f2", 2, role="Gerente")]
    app, db = api(proforma=REJECTED, phases=phases, claim=CLAIM)
    as_role(caller_permissions, "Jefe")
    assert decide(app, {"action": "appeal", "comment": "sí procede"})["statusCode"] == 403
    as_role(caller_permissions, "Liquidador")
    assert decide(app, {"action": "appeal"})["statusCode"] == 400  # exige explicación
    response = decide(app, {"action": "appeal", "comment": "el monto es correcto"})
    assert body_of(response)["status"] == "En Revisión"
    assert "SET status = 'apelado'" in tx_sql(db)


def test_apelar_sin_reclamo_abierto_es_409(api, caller_permissions):
    app, db = api(proforma=REJECTED, phases=[phase("f1", 1, "rechazada")], claim=None)
    as_role(caller_permissions, "Liquidador")
    assert decide(app, {"action": "appeal", "comment": "x"})["statusCode"] == 409


def test_aprobar_tras_apelar_acepta_el_reclamo(api, caller_permissions):
    app, db = api(phases=[phase("f1", 1), phase("f2", 2, role="Gerente")], claim={**CLAIM, "status": "apelado"})
    as_role(caller_permissions, "Jefe")
    assert decide(app, {"action": "approve", "phaseId": "f1"})["statusCode"] == 200
    close = next(p for s, p in db.tx_calls if s.startswith("UPDATE tarifas_proforma_claims"))
    assert close[0] == "aceptado"


def test_rechazar_de_nuevo_tras_apelar_cierra_y_abre_otro_reclamo(api, caller_permissions):
    app, db = api(claim={**CLAIM, "status": "apelado"})
    as_role(caller_permissions, "Jefe")
    assert decide(app, {"action": "reject", "phaseId": "f1", "comment": "sigue mal"})["statusCode"] == 200
    close = next(p for s, p in db.tx_calls if s.startswith("UPDATE tarifas_proforma_claims"))
    assert close[0] == "rechazado"
    assert "INSERT INTO tarifas_proforma_claims" in tx_sql(db)


def test_reiniciar_anula_proforma_y_liquidaciones_por_reclamo(api, caller_permissions):
    app, db = api(proforma=REJECTED, phases=[phase("f1", 1, "rechazada")], claim=CLAIM)
    as_role(caller_permissions, "Jefe")
    assert decide(app, {"action": "restart"})["statusCode"] == 403
    as_role(caller_permissions, "Liquidador")
    response = decide(app, {"action": "restart"})
    assert body_of(response)["status"] == "Anulado"
    void = next(p for s, p in db.tx_calls if "void_kind = 'reclamo'" in s)
    assert void == ["montos mal", "prc_1", "pro_1"]
    assert "tarifas_proforma_items SET state = 'excluded'" in tx_sql(db)
    assert next(p for s, p in db.tx_calls if s.startswith("UPDATE tarifas_proforma_claims"))[0] == "reiniciado"


def test_los_reclamos_no_se_escriben_por_la_api_generica(api, caller_permissions):
    from proformas_api import check_direct_write  # noqa: PLC0415 — módulo del stack, ver load_stack_module
    for kind in ("insert", "update", "delete"):
        with pytest.raises(Exception):
            check_direct_write("tarifas_proforma_claims", kind, {})
