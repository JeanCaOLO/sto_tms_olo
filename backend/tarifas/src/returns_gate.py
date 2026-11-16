"""Un viaje con devoluciones sin recibir no se liquida.

La recepción la hace el rol "Devoluciones" (backend/admin, admin_returns.py). Mientras haya devoluciones
`pending`/`approved` en alguna parada del viaje, `tarifas_settlements` no admite una liquidación nueva de ese
viaje. Solo se mira el INSERT: anular o cambiar el estado de una liquidación existente no se toca.

Va detrás del flag `TMS_RETURNS_GATE` (variable de entorno del Lambda; apagado por defecto), para activarlo
solo cuando los viajes con devoluciones ya existentes estén al día. Con el flag apagado no cambia nada.
"""

import os

from tms_common.errors import HttpError

import tarifas_db

SETTLEMENTS = "tarifas_settlements"
ENABLED_VALUES = ("on", "1", "true", "yes")

OPEN_RETURNS_SQL = """
SELECT count(*)::int AS open_returns
FROM tbl_returns rt
JOIN tbl_dispatch_guides g ON g.id = rt.dispatch_guide_id
WHERE g.route_id = %s AND COALESCE(rt.status, 'pending') IN ('pending', 'approved', 'in_review')
"""


def enabled() -> bool:
    return os.environ.get("TMS_RETURNS_GATE", "off").strip().lower() in ENABLED_VALUES


def check(table_name: str, rows: object) -> None:
    """409 si alguna de las liquidaciones a insertar es de un viaje con devoluciones sin recibir."""
    if not enabled() or table_name != SETTLEMENTS:
        return
    values = rows if isinstance(rows, list) else [rows]
    trips = {str(row["trip_id"]) for row in values if isinstance(row, dict) and row.get("trip_id")}
    for trip_id in sorted(trips):
        open_returns = tarifas_db.query(OPEN_RETURNS_SQL, [trip_id])[0]["open_returns"]
        if open_returns:
            raise HttpError(409, f"El viaje tiene {open_returns} devolución(es) sin recibir: "
                                 "recíbelas en el módulo de Devoluciones antes de liquidarlo.")
