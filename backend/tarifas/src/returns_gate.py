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
OPEN_COLLECTIONS_SQL = """
SELECT count(*)::int AS open_collections FROM vw_return_collection_assignments a
LEFT JOIN tbl_return_collection_results cr ON cr.attempt_id=a.attempt_id
WHERE a.route_id=%s AND (cr.attempt_id IS NULL OR (cr.quantity>0 AND cr.delivered_event_id IS NULL))
"""


def enabled() -> bool:
    return os.environ.get("TMS_RETURNS_GATE", "off").strip().lower() in ENABLED_VALUES


def guards(table_name: str) -> bool:
    """La escritura necesita la comprobación dentro de su transacción (flag activo y tabla de liquidaciones)."""
    return enabled() and table_name == SETTLEMENTS


# Bloquea TODAS las devoluciones del viaje en modo compartido: el registro de una novedad y la recepción toman la
# fila en modo exclusivo, así que no pueden cambiar entre esta lectura y el INSERT de la liquidación.
LOCK_RETURNS_SQL = """
SELECT COALESCE(rt.status, 'pending') AS status
FROM tbl_returns rt
JOIN tbl_dispatch_guides g ON g.id = rt.dispatch_guide_id
WHERE g.route_id = %s
ORDER BY rt.id
FOR SHARE OF rt
"""
OPEN_STATUSES = ("pending", "approved", "in_review")
LOCK_ROUTE_SQL = "SELECT id FROM tbl_routes WHERE id=%s FOR UPDATE"
LOCK_COLLECTIONS_SQL = """
SELECT a.id FROM vw_return_collection_assignments a
LEFT JOIN tbl_return_collection_results cr ON cr.attempt_id=a.attempt_id
WHERE a.route_id=%s AND (cr.attempt_id IS NULL OR (cr.quantity>0 AND cr.delivered_event_id IS NULL))
ORDER BY a.id FOR SHARE OF a
"""


def _trip_ids(rows: object) -> list[str]:
    values = rows if isinstance(rows, list) else [rows]
    return sorted({str(row["trip_id"]) for row in values if isinstance(row, dict) and row.get("trip_id")})


def recheck(run, ops: list) -> None:
    """Repite la comprobación dentro de la transacción de escritura, con las devoluciones del viaje bloqueadas."""
    trips=set()
    for op in ops:
        if isinstance(op,dict) and guards(str(op.get('table'))) and op.get('op') in ('insert','insert_many'):
            trips.update(_trip_ids(op.get('rows') if op['op']=='insert_many' else op.get('values')))
    for trip_id in sorted(trips):
        # El mismo mutex lo toman entrega/contracamión/asignación antes de crear nuevas filas del viaje.
        run(LOCK_ROUTE_SQL,[trip_id])
        open_returns = sum(1 for row in run(LOCK_RETURNS_SQL, [trip_id]) if row['status'] in OPEN_STATUSES)
        open_collections = len(run(LOCK_COLLECTIONS_SQL,[trip_id]))
        if open_returns or open_collections:
            raise HttpError(409, f'El viaje tiene {open_returns} devolución(es) sin recibir y '
                                 f'{open_collections} recolecta(s) pendientes de entrega.')


def check(table_name: str, rows: object) -> None:
    """409 si alguna de las liquidaciones a insertar es de un viaje con devoluciones sin recibir."""
    if not enabled() or table_name != SETTLEMENTS:
        return
    values = rows if isinstance(rows, list) else [rows]
    trips = {str(row["trip_id"]) for row in values if isinstance(row, dict) and row.get("trip_id")}
    for trip_id in sorted(trips):
        open_returns = tarifas_db.query(OPEN_RETURNS_SQL, [trip_id])[0]["open_returns"]
        open_collections = tarifas_db.query(OPEN_COLLECTIONS_SQL,[trip_id])[0]['open_collections']
        if open_returns or open_collections:
            raise HttpError(409, f"El viaje tiene {open_returns} devolución(es) sin recibir: "
                                 f"y {open_collections} recolecta(s) pendientes de entrega.")
