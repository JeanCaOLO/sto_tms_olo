"""Bitácora del OMS (tabla oms_logs, sql/49).

Escribe una fila por cada acción importante del motor para la pestaña "Logs OMS"
de Auditoría (solo developer). Complementa —no reemplaza— los logs JSON que la
Lambda ya manda a CloudWatch.

Diseño: BEST-EFFORT. `registrar()` NUNCA lanza — si la escritura falla (BD caída,
tabla ausente), se traga el error y deja rastro en stdout, para no tumbar la
corrida del motor por un fallo de bitácora. En modo mock (OMS_SOURCE != live) es
un no-op silencioso: no hay BD a la que escribir.

ponytail: INSERT directo sin cola/buffer; techo conocido: una escritura por
evento. Si el volumen crece, upgrade path = batch/async o directo a CloudWatch.
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any

logger = logging.getLogger()

_INSERT_SQL = """
INSERT INTO oms_logs
  (level, action, corrida_id, message, detail, actor)
VALUES (%s, %s, %s, %s, %s, %s)
"""


def _modo_live() -> bool:
    return os.environ.get("OMS_SOURCE", "mock") == "live"


def registrar(
    action: str,
    message: str,
    *,
    level: str = "info",
    corrida_id: str | None = None,
    detail: Any | None = None,
    actor: str = "system",
) -> None:
    """Registra una entrada en oms_logs. Best-effort: nunca lanza.

    El contexto variable (viaje, pedido, país, compañía, totales…) va dentro de
    `detail` (jsonb), que es extensible sin migrar el esquema. La tabla solo tiene
    columnas estables: level/action/message/actor + corrida_id (correlación)."""
    if not _modo_live():
        return
    try:
        from tms_common import pg  # import local: el esqueleto corre sin el Layer en tests

        detail_json = json.dumps(detail, default=str) if detail is not None else None
        pg.query(_INSERT_SQL, [level, action, corrida_id, message, detail_json, actor])
    except Exception:  # noqa: BLE001 — la bitácora jamás tumba la corrida
        logger.exception("oms_log.registrar falló (action=%s) — se ignora", action)
