"""Métricas de aplicación del tarifador, sin infraestructura nueva.

Cada request imprime UNA línea en el formato EMF (Embedded Metric Format) de CloudWatch: CloudWatch la
convierte sola en métricas del espacio `TMS/Tarifas` (duración, sentencias SQL, errores, arranques en
frío) sin que nadie cree nada en AWS. Si la línea no se lee como métrica (por ejemplo, en local), queda
como un log estructurado igual de útil: `Route`, `Table`, `DurationMs`, `Queries`, `Status`.

Lambda atiende una request por contenedor, así que el estado del request actual puede ser global.
"""

import json
import time

NAMESPACE = "TMS/Tarifas"

_cold_start = True
_current = {"queries": 0, "started": 0.0}


def count_query() -> None:
    """Una sentencia SQL enviada a la base en el request actual."""
    _current["queries"] += 1


def start() -> None:
    _current["queries"] = 0
    _current["started"] = time.perf_counter()


def finish(route: str, table: str | None, status: int) -> dict:
    """Imprime y devuelve la línea de métricas del request que termina."""
    global _cold_start
    duration_ms = round((time.perf_counter() - _current["started"]) * 1000, 1)
    line = {
        "_aws": {
            "Timestamp": int(time.time() * 1000),
            "CloudWatchMetrics": [{
                "Namespace": NAMESPACE,
                "Dimensions": [["Route"]],
                "Metrics": [
                    {"Name": "DurationMs", "Unit": "Milliseconds"},
                    {"Name": "Queries", "Unit": "Count"},
                    {"Name": "Errors", "Unit": "Count"},
                    {"Name": "ColdStart", "Unit": "Count"},
                ],
            }],
        },
        "Route": route,
        "Table": table or "",
        "Status": status,
        "DurationMs": duration_ms,
        "Queries": _current["queries"],
        "Errors": 1 if status >= 500 else 0,
        "ColdStart": 1 if _cold_start else 0,
    }
    _cold_start = False
    print(json.dumps(line, separators=(",", ":")))
    return line
