"""Sonda de schema: ¿existe una tabla del contrato §1 en Aurora?

WT-1 entrega el DDL de `route_plans`/`plan_trips`/`plan_stops` y siembra
`order_items`. Mientras eso no esté aplicado, los adaptadores consultan esta
sonda y caen a datos mock explícitos, en vez de reventar con "relation does not
exist". Se cachea por contenedor Lambda: el schema no cambia entre invocaciones.
"""

from __future__ import annotations

from lib.tms_common import pg
from adapters.outbound.aurora.sql import TABLE_EXISTS_SQL

_existe_cache: dict[str, bool] = {}


def tabla_existe(nombre: str) -> bool:
    if nombre not in _existe_cache:
        try:
            rows = pg.query(TABLE_EXISTS_SQL, [nombre])
            _existe_cache[nombre] = bool(rows and rows[0]["exists"])
        except Exception:
            # Sin conexión a Aurora (local/tests sin BD) o error del driver:
            # asumir que la tabla no existe y dejar que el adaptador use su mock.
            # En producción con BD viva esta rama no se toma; es la red de
            # seguridad del "mock donde falte el schema" del brief.
            _existe_cache[nombre] = False
    return _existe_cache[nombre]
