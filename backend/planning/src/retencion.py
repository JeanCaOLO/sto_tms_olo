"""Retención del registro de corridas del motor de ruteo (tbl_routing_runs, sql/72 y sql/74).

Borra las corridas de más de ROUTING_RUNS_RETENCION_DIAS días (90 por defecto; 0 = no
borra nada). Lo llama el replan programado cada hora: el borrado usa el índice por
created_at y casi siempre no encuentra nada. Nunca tumba el replan: si falla, lo deja en
el log y sigue.
"""

import logging
import os

from tms_common import pg

DIAS_DEFECTO = 90
_PURGA = "DELETE FROM tbl_routing_runs WHERE created_at < now() - make_interval(days => %s) RETURNING id"

log = logging.getLogger(__name__)


def dias() -> int:
    try:
        valor = int(os.environ.get("ROUTING_RUNS_RETENCION_DIAS", "") or DIAS_DEFECTO)
        return max(valor, 0)
    except ValueError:
        return DIAS_DEFECTO


def purgar() -> int:
    """Borra las corridas viejas y devuelve cuántas. 0 si la retención está apagada o falla."""
    retencion = dias()
    if retencion == 0:
        return 0
    try:
        borradas = len(pg.query(_PURGA, [retencion]))
    except Exception:  # noqa: BLE001 — la retención jamás tumba la planificación
        log.exception("retención de tbl_routing_runs falló (se reintenta en el próximo replan)")
        return 0
    if borradas:
        log.info("retención: %s corridas de más de %s días borradas", borradas, retencion)
    return borradas
