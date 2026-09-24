"""Mantenimiento mensual de la bitácora (sql/17): crea las particiones de los
próximos meses de audit.events. Lo dispara EventBridge el día 1 de cada mes.

Si nunca corriera, nada se pierde: las filas caen en audit.events_default.
"""

import logging

from tms_common import pg

logger = logging.getLogger()
logger.setLevel(logging.INFO)

MONTHS_AHEAD = 3
ENSURE_SQL = "SELECT audit.ensure_partitions(%s) AS created"


def handler(_event: dict, _context: object) -> dict:
    created = pg.query(ENSURE_SQL, [MONTHS_AHEAD])[0]["created"]
    logger.info("Particiones de audit.events creadas: %s", created)
    return {"created": created}
