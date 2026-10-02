"""Reglas puras de la matriz de permisos por rol (módulo × acción + países).

Portado de la parte NO-SQL de `origin/main:backend/admin/src/admin_permissions.py`
(`_valid_modules`, forma de `all_countries`/`country_ids`). La existencia de los
módulos/países contra la BD la comprueba el caso de uso; aquí solo se valida la
forma del payload. Lanza `DatosInvalidos`; el adaptador inbound lo mapea a 400.
"""

from __future__ import annotations

from domain.admin.payload import DatosInvalidos
from lib.tms_common.permissions import ACTIONS


def valid_modules(raw: object, known: set[str]) -> list[tuple[str, str]]:
    """Aplana { módulo: [acciones] } a pares (módulo, acción), validando que el
    módulo exista (`known`) y que las acciones sean válidas. Sin duplicados."""
    if not isinstance(raw, dict):
        raise DatosInvalidos('"modules" debe ser un objeto { módulo: [acciones] }')
    pairs: list[tuple[str, str]] = []
    for key, actions in raw.items():
        if key not in known:
            raise DatosInvalidos(f'Módulo desconocido: "{key}"')
        if not isinstance(actions, list) or any(a not in ACTIONS for a in actions):
            raise DatosInvalidos(f'Acciones inválidas en "{key}"; válidas: {", ".join(ACTIONS)}')
        pairs.extend((key, action) for action in dict.fromkeys(actions))
    return pairs


def requested_countries(body: dict) -> tuple[bool, list[str]]:
    """Normaliza (all_countries, country_ids) del payload. No verifica existencia
    de los países contra la BD (eso lo hace el caso de uso)."""
    all_countries = body.get("all_countries", True)
    if not isinstance(all_countries, bool):
        raise DatosInvalidos('"all_countries" debe ser true o false')
    ids = list(dict.fromkeys(body.get("country_ids") or []))
    if all_countries:
        return True, []
    if not ids:
        raise DatosInvalidos("Elegí al menos un país o marcá todos los países.")
    return False, ids
