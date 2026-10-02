"""Adaptador Aurora del port ZonaRepo (zones)."""

from __future__ import annotations

from adapters.outbound.aurora import mocks
from adapters.outbound.aurora.schema_probe import tabla_existe
from adapters.outbound.aurora.sql import ZONES_SQL
from lib.tms_common import pg


class AuroraZonaRepo:
    """Implementa `ports.ZonaRepo`. Mock si `zones` no existe todavía."""

    def codigos(self, organization_id: str, warehouse_id: str | None) -> list[str]:
        if not tabla_existe("zones"):
            return list(mocks.MOCK_ZONAS)
        rows = pg.query(ZONES_SQL, [organization_id])
        return [str(r["code"]) for r in rows]
