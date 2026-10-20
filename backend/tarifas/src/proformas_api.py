"""Decisiones sobre las fases de una proforma: aprobar, rechazar, quitar, reenviar o anular.

Todo cambio de estado de una proforma o de una fase pasa por aquí (la API genérica los rechaza, ver
`check_direct_write`): así quién puede aprobar cada fase lo decide el servidor, no el navegador.
Una decisión escribe en UNA transacción: la fase, el estado de la proforma y la bitácora.
"""

import json

from tms_common import permissions
from tms_common.errors import HttpError
from tms_common.event import auth_user, json_body, path_param
from tms_common.responses import json_response

import proformas_flow
import tarifas_db
import tarifas_perms
import tarifas_sql

MODULE = "tarifas.proformas"
PROFORMAS = "tarifas_proformas"
PHASES = "tarifas_proforma_phases"
ITEMS = "tarifas_proforma_items"
# Estado que toman las liquidaciones de una proforma cuando ésta cambia (anulada: se liberan en Borrador).
SETTLEMENT_STATUS = {"Anulado": "Borrador"}
DIRECT_STATUS_MESSAGE = "El estado y las fases de una proforma cambian solo con su decisión (aprobar, rechazar, quitar fase)."


def check_direct_write(table: str, kind: str, values: object) -> None:
    """La API genérica no puede saltarse el flujo: ni cambiar fases ni el estado de una proforma."""
    if table == PHASES and kind in ("update", "delete"):
        raise HttpError(405, DIRECT_STATUS_MESSAGE)
    if table == PROFORMAS and kind == "delete":
        raise HttpError(405, "Una proforma no se borra: se anula.")
    if table == PROFORMAS and kind == "update" and isinstance(values, dict) and "status" in values:
        raise HttpError(405, DIRECT_STATUS_MESSAGE)


def _load(proforma_id: str, caller: permissions.Permissions) -> tuple[dict, list[dict]]:
    sql, params = "SELECT id, country_id, status FROM tarifas_proformas WHERE id = %s", [proforma_id]
    rows = tarifas_db.query(sql, params)
    if not rows or not _in_scope(caller, rows[0]["country_id"]):
        raise HttpError(404, "Proforma no encontrada.")
    phases = tarifas_db.query(
        "SELECT id, position, state, approver_type, role_name, user_id FROM tarifas_proforma_phases "
        "WHERE proforma_id = %s ORDER BY position", [proforma_id])
    return rows[0], phases


def _in_scope(caller: permissions.Permissions, country_id: object) -> bool:
    allowed = caller.country_filter
    return allowed is None or str(country_id) in allowed


def _phase_sql(fields: dict, actor: str) -> tuple[str, list]:
    if fields.get("reset"):
        return ("UPDATE tarifas_proforma_phases SET state = 'pendiente', decided_by = NULL, decided_at = NULL, "
                "comment = NULL WHERE id = %s RETURNING id", [])
    removed = ", removed_by = %s" if fields.get("removed") else ""
    sql = ("UPDATE tarifas_proforma_phases SET state = %s, decided_by = %s, decided_at = now(), comment = %s"
           f"{removed} WHERE id = %s AND state = 'pendiente' RETURNING id")
    params = [fields["state"], actor, fields.get("comment")] + ([actor] if fields.get("removed") else [])
    return sql, params


def _audit_sql(proforma_id: str, action: str, actor: str, role: str | None, before: str, after: str, reason: str | None):
    return ("INSERT INTO tarifas_audit_log (id, entity, entity_id, action, user_name, role, before, after, reason, created_at) "
            "VALUES (%s, 'proforma', %s, %s, %s, %s, %s::jsonb, %s::jsonb, %s, now()) RETURNING id",
            [tarifas_sql.new_id("audit"), proforma_id, action, actor, role or "desconocido",
             json.dumps({"status": before}), json.dumps({"status": after}), reason])


def decide(event: dict) -> dict:
    """POST /api/tarifas/proformas/{id}/decision — body: { action, phaseId?, comment? }."""
    caller = tarifas_perms.for_event(event)
    caller.require(MODULE, "edit")
    proforma_id = path_param(event, "id")
    body = json_body(event)
    if not isinstance(body, dict):
        raise HttpError(400, "El body debe ser un objeto JSON")
    proforma, phases = _load(proforma_id, caller)
    action = str(body.get("action") or "")
    actor = auth_user(event).get("email") or caller.app_user_id
    plan = _plan(proforma, phases, action, body, caller)

    def apply(run) -> list:
        for phase_id, fields in plan["changes"]:
            sql, params = _phase_sql(fields, actor)
            rows = run(sql, params + [phase_id])
            if not rows:  # otro usuario decidió esta fase antes: se revierte todo
                raise HttpError(409, "La fase ya fue decidida por otra persona. Actualiza la pantalla.")
        run("UPDATE tarifas_proformas SET status = %s, updated_at = now() WHERE id = %s RETURNING id",
            [plan["status"], proforma_id])
        # El estado de las liquidaciones incluidas sigue al de la proforma (anulada = vuelven a Borrador).
        run("UPDATE tarifas_settlements SET status = %s, updated_at = now() "
            "WHERE id IN (SELECT settlement_id FROM tarifas_proforma_items WHERE proforma_id = %s AND state <> 'excluded') "
            "AND status IN ('Borrador', 'En Revisión', 'Aprobado') AND superseded_by IS NULL RETURNING id",
            [SETTLEMENT_STATUS.get(plan["status"], plan["status"]), proforma_id])
        if action == "annul":
            run("UPDATE tarifas_proforma_items SET state = 'excluded', exclusion_reason = 'Proforma anulada' "
                "WHERE proforma_id = %s AND state <> 'excluded' RETURNING id", [proforma_id])
        sql, params = _audit_sql(proforma_id, action, actor, caller.role_name, proforma["status"], plan["status"],
                                 (str(body.get("comment") or "").strip() or None))
        run(sql, params)
        return []

    tarifas_db.run_in_transaction(apply, retries=2)
    return json_response(200, {"status": plan["status"], "phases": _load(proforma_id, caller)[1]})


def authorize_send(event: dict) -> dict:
    """Invocación directa (no HTTP) de la Lambda de envío, que corre fuera de la VPC y no ve Aurora.

    `{ "action": "authorize_send", "user_id": <auth id>, "proforma_id": ... }` -> `{ ok, status?, message? }`.
    Solo se puede enviar una proforma APROBADA, de un país del usuario, con permiso de editar proformas."""
    try:
        caller = permissions.for_user(str(event.get("user_id") or ""))
        caller.require(MODULE, "edit")
        proforma, _ = _load(str(event.get("proforma_id") or ""), caller)
    except HttpError as err:
        return {"ok": False, "status": err.status, "message": str(err)}
    if proforma["status"] != "Aprobado":
        return {"ok": False, "status": 409, "message": f'La proforma está "{proforma["status"]}": solo se envía una aprobada.'}
    return {"ok": True}


def _plan(proforma: dict, phases: list[dict], action: str, body: dict, caller: permissions.Permissions) -> dict:
    status = proforma["status"]
    if action == "annul":
        if status in ("Anulado", "Pagado"):
            raise HttpError(409, f'Una proforma "{status}" no se puede anular.')
        if not str(body.get("comment") or "").strip():
            raise HttpError(400, "Indica el motivo de la anulación.")
        return {"changes": [], "status": "Anulado"}
    if status in ("Anulado", "Pagado"):
        raise HttpError(409, f'La proforma está "{status}": ya no admite decisiones.')
    return proformas_flow.plan_decision(
        phases, body.get("phaseId"), action,
        user_id=caller.app_user_id, role_name=caller.role_name, is_admin=caller.is_admin, comment=body.get("comment"))
