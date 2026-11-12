"""Alertas de vencimiento.

- GET /api/v1/alerts/expirations (API, con sesión): lo que vence en ≤ 30 días o ya venció y que el
  usuario puede ver (contratos si ve `transportistas`, licencias si ve `conductores`, y sus países).
- digest_handler (SIN API; solo lo invoca la Lambda del correo diario, con IAM): todas las alertas.
"""

from tms_common import permissions, pg
from tms_common.handler import tms_handler
from tms_common.responses import json_response

from expirations import EXPIRATIONS_SQL, WINDOW_DAYS, classify, visible_to


def all_alerts() -> list[dict]:
    return [classify(row) for row in pg.query(EXPIRATIONS_SQL, [WINDOW_DAYS])]


def list_expirations(event: dict) -> dict:
    caller = permissions.for_event(event)
    alerts = visible_to(all_alerts(), contracts=caller.can("transportistas", "view"),
                        licenses=caller.can("conductores", "view"), countries=caller.country_filter)
    return json_response(200, {"data": alerts, "error": None, "window_days": WINDOW_DAYS})


handler = tms_handler({"GET /api/v1/alerts/expirations": list_expirations})


def digest_handler(event: dict, context: object) -> dict:
    """Para el correo diario: devuelve todas las alertas (sin filtrar por usuario)."""
    return {"window_days": WINDOW_DAYS, "alerts": all_alerts()}
