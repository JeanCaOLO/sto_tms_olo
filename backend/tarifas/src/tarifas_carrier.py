"""Usuario transportista: solo ve las proformas de SU empresa (y lo que cuelga de ellas).

Un usuario con `carrier_id` (rol Transportista) no es un liquidador: no lee el catálogo de tarifas ni escribe
nada por la API genérica. Su única escritura es decidir una fase (`proformas_api.decide`), que también valida
la empresa. El filtro vive en el servidor: el navegador solo refleja lo que éste le deja ver.
"""

from tms_common import permissions
from tms_common.errors import HttpError

OWN_PROFORMAS = "SELECT id FROM tbl_tarifas_proformas WHERE carrier_id = %s::uuid"

# tabla -> condición SQL con UN parámetro (la empresa). Lo que no figura aquí no se le muestra.
_CLAUSES = {
    "tarifas_proformas": "carrier_id = %s::uuid",
    "tarifas_proforma_phases": f"proforma_id IN ({OWN_PROFORMAS})",
    "tarifas_proforma_items": f"proforma_id IN ({OWN_PROFORMAS})",
    "tarifas_proforma_claims": f"proforma_id IN ({OWN_PROFORMAS})",
    "tarifas_settlements": f"id IN (SELECT settlement_id FROM tbl_tarifas_proforma_items WHERE proforma_id IN ({OWN_PROFORMAS}))",
    "tarifas_audit_log": f"entity = 'proforma' AND entity_id IN ({OWN_PROFORMAS})",
}


def read_scope(caller: permissions.Permissions, table: str) -> tuple[str, list] | None:
    """Condición extra de una lectura. None = sin restricción (no es usuario transportista)."""
    if caller.carrier_id is None:
        return None
    clause = _CLAUSES.get(table)
    if clause is None:
        raise HttpError(403, "Tu usuario de transportista solo consulta las proformas de su empresa.")
    return clause, [caller.carrier_id]


def forbid_write(caller: permissions.Permissions) -> None:
    if caller.carrier_id is not None:
        raise HttpError(403, "Tu usuario de transportista solo puede aprobar o rechazar proformas de su empresa.")


def owns(caller: permissions.Permissions, proforma_carrier_id: object) -> bool:
    return caller.carrier_id is None or str(proforma_carrier_id) == caller.carrier_id
