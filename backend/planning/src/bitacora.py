"""Historial de ejecuciones de Planificación en la bitácora compartida con el OMS.

Escribe en `tbl_oms_logs` (sql/49) la misma forma de fila que el OMS (level, action,
message, detail, actor), así el Panel del OMS muestra ambas en un solo historial; el
tipo (Planificación/OMS) se deduce de `action` (prefijo `planif_`).

Best-effort, igual que `oms_log.registrar`: nunca lanza.
ponytail: la tabla se llama oms_logs aunque ya es compartida; renombrar a una bitácora
general si se suma un tercer módulo.
"""

import json
import logging

from tms_common import pg

_INSERT = """INSERT INTO tbl_oms_logs (level, action, corrida_id, message, detail, actor)
VALUES (%s, %s, %s, %s, %s, %s)"""


def registrar(action: str, message: str, *, level: str = "info", detail: dict | None = None,
              actor: str = "system") -> None:
    try:
        pg.query(_INSERT, [level, action, None, message, json.dumps(detail or {}, default=str), actor])
    except Exception:  # noqa: BLE001 - la bitácora jamás tumba la planificación
        logging.getLogger().exception("bitacora.registrar falló (action=%s) — se ignora", action)


def ingestar(ingest) -> tuple[dict | None, str | None]:
    """Corre la ingesta de eFlow sin bloquear la planificación: (resumen, error)."""
    try:
        return ingest(), None
    except Exception as exc:  # noqa: BLE001 - frontera: no bloquear por eFlow
        logging.getLogger().exception("ingest eFlow no disponible; se planifica sobre lo ya ingestado")
        return None, str(exc) or type(exc).__name__


def registrar_corrida(action: str, titulo: str, ingesta: dict | None, error: str | None,
                      planificados: list[str], bloqueados: list[str], actor: str) -> None:
    """Una fila por corrida: qué se ingestó de eFlow y qué días se planificaron."""
    partes = [f"{len(planificados)} día(s) planificado(s)"]
    if bloqueados:
        partes.append(f"{len(bloqueados)} bloqueado(s) por viajes despachados")
    if ingesta:
        partes.append(f"{ingesta.get('leidos', 0)} pedidos leídos de eFlow")
        if ingesta.get("salidos"):
            partes.append(f"{ingesta['salidos']} salieron de la cola")
    else:
        partes.append(f"eFlow no disponible ({error})")
    registrar(action, f"{titulo}: " + ", ".join(partes), level="info" if ingesta else "warn",
              detail={"total": ingesta.get("leidos") if ingesta else None,
                      "salidos": ingesta.get("salidos") if ingesta else None,
                      "planificados": planificados, "bloqueados": bloqueados, "error_ingesta": error},
              actor=actor)
