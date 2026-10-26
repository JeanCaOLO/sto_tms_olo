"""Reglas del flujo de fases de una proforma (espejo de `src/lib/tarifas/proformas/`).

Funciones puras: reciben las fases como dicts de `tarifas_proforma_phases` y devuelven el cambio a
aplicar. La decisión de quién puede aprobar se toma AQUÍ, en el servidor: el frontend solo la
refleja para mostrar u ocultar botones.
"""

from tms_common.errors import HttpError

ACTIONS = ("approve", "reject", "skip", "resubmit", "appeal")
# Roles (además de los administradores) que gestionan reclamos: reiniciar la liquidación o apelar.
MANAGER_ROLES = ("liquidador",)


def current_phase(phases: list[dict]) -> dict | None:
    pending = [p for p in sorted(phases, key=lambda p: p["position"]) if p["state"] == "pendiente"]
    return pending[0] if pending else None


def resolve_status(phases: list[dict]) -> str:
    if any(p["state"] == "rechazada" for p in phases):
        return "Borrador"
    if any(p["state"] == "pendiente" for p in phases):
        return "En Revisión"
    return "Aprobado"


def _same(a: str | None, b: str | None) -> bool:
    return (a or "").strip().lower() == (b or "").strip().lower()


def can_manage(role_name: str | None, is_admin: bool) -> bool:
    """Quien gestiona reclamos: el Liquidador o un administrador. El servidor lo decide; la UI solo lo refleja."""
    return is_admin or (role_name or "").strip().lower() in MANAGER_ROLES


def can_decide(phase: dict, phases: list[dict], user_id: str, role_name: str | None) -> bool:
    """Solo la fase en curso, y solo su aprobador (usuario concreto o cualquiera con el rol)."""
    current = current_phase(phases)
    if phase["state"] != "pendiente" or current is None or current["id"] != phase["id"]:
        return False
    if phase["approver_type"] == "user":
        return str(phase["user_id"]) == str(user_id)
    return _same(phase["role_name"], role_name)


def plan_decision(phases: list[dict], phase_id: str | None, action: str, *, user_id: str, role_name: str | None,
                  is_admin: bool, comment: str | None) -> dict:
    """Valida la acción y devuelve `{ "changes": [(phase_id, fields)], "status": str }`.

    `is_admin` es el de `tms_common.permissions` (roles administradores por nombre): solo ellos quitan fases.
    Lanza HttpError 400/403/409 con un mensaje para el usuario cuando no corresponde."""
    comment = (comment or "").strip() or None
    if action not in ACTIONS:
        raise HttpError(400, f'La acción debe ser una de: {", ".join(ACTIONS)}')
    if action == "resubmit":
        return _resubmit(phases)
    if action == "appeal":
        return _appeal(phases, role_name, is_admin, comment)
    phase = next((p for p in phases if p["id"] == phase_id), None)
    if phase is None:
        raise HttpError(404, "La fase no existe en esta proforma.")
    if action == "skip":
        return _skip(phases, phase, is_admin, comment)
    if not can_decide(phase, phases, user_id, role_name):
        raise HttpError(403, "No puedes decidir esta fase: no es tu turno o no tienes el rol requerido.")
    if action == "reject" and not comment:
        raise HttpError(400, "Para rechazar indica el motivo.")
    state = "aprobada" if action == "approve" else "rechazada"
    return _result(phases, {phase["id"]: {"state": state, "comment": comment}})


def _skip(phases: list[dict], phase: dict, is_admin: bool, reason: str | None) -> dict:
    if not is_admin:
        raise HttpError(403, "Solo un superadministrador puede quitar fases de una proforma.")
    if not reason:
        raise HttpError(400, "Indica el motivo para quitar la fase.")
    if phase["state"] != "pendiente":
        raise HttpError(409, "Solo se puede quitar una fase que sigue pendiente.")
    return _result(phases, {phase["id"]: {"state": "omitida", "comment": reason, "removed": True}})


def _resubmit(phases: list[dict]) -> dict:
    """Tras un rechazo, la proforma vuelve a revisión desde la primera fase (las quitadas siguen quitadas)."""
    if not any(p["state"] == "rechazada" for p in phases):
        raise HttpError(409, "Solo se puede reenviar una proforma rechazada.")
    changes = {p["id"]: {"state": "pendiente", "reset": True} for p in phases if p["state"] != "omitida"}
    return _result(phases, changes)


def _appeal(phases: list[dict], role_name: str | None, is_admin: bool, reason: str | None) -> dict:
    """El liquidador devuelve la proforma a la fase que la rechazó, explicando por qué el reclamo no procede.
    Las fases ya aprobadas se conservan; la rechazada vuelve a `pendiente` y su rol decide de nuevo."""
    if not can_manage(role_name, is_admin):
        raise HttpError(403, "Solo el liquidador puede apelar un reclamo.")
    if not reason:
        raise HttpError(400, "Explica por qué el reclamo no procede.")
    rejected = next((p for p in sorted(phases, key=lambda p: p["position"]) if p["state"] == "rechazada"), None)
    if rejected is None:
        raise HttpError(409, "Solo se puede apelar una proforma rechazada.")
    return _result(phases, {rejected["id"]: {"state": "pendiente", "reset": True}})


def _result(phases: list[dict], changes: dict[str, dict]) -> dict:
    after = [{**p, "state": changes[p["id"]]["state"]} if p["id"] in changes else p for p in phases]
    return {"changes": list(changes.items()), "status": resolve_status(after)}
