"""Sincroniza la cola de eFlow (EXPEDICIONESCABECERA) a la tabla espejo de Aurora
`sim_expedicionescabecera` (misma estructura y nombres que el origen).

Copia las filas reales (todas las columnas) para que el espejo luzca como la
cabecera de eFlow; el nº de viaje (NUMEROVIAJEWMH) NO se pisa en el UPSERT: lo
escribe el planificador (write-back simulado) y debe preservarse entre syncs.
"""

from tms_common import eflow_db, pg

PAIS = "cr"
_KEY = ("IDALMACEN", "IDCOMPANIA", "IDSUCURSAL", "IDEXPEDICION")
_NO_PISAR = set(_KEY) | {"NUMEROVIAJEWMH"}  # el write-back vive aquí; no lo pisa el sync
_BOOL = {"KITSPROCESADO", "KITSVERIFICADOS"}


def _val(col: str, v):
    return bool(v) if col in _BOOL and v is not None else v


def _upsert(r: dict) -> None:
    cols = list(r.keys())
    colnames = ", ".join(f'"{c}"' for c in cols)
    placeholders = ", ".join(["%s"] * len(cols))
    updates = ", ".join(f'"{c}"=EXCLUDED."{c}"' for c in cols if c not in _NO_PISAR)
    conflict = ", ".join(f'"{c}"' for c in _KEY)
    sql = (f'INSERT INTO sim_expedicionescabecera ({colnames}) VALUES ({placeholders}) '
           f'ON CONFLICT ({conflict}) DO UPDATE SET {updates}, escrito_en=now()')
    pg.query(sql, [_val(c, r[c]) for c in cols])


def sincronizar() -> int:
    """Copia la cola DISP/DISP de eFlow a sim_expedicionescabecera. Devuelve cuántas."""
    sap = eflow_db.db_names(PAIS).db_sap
    rows = eflow_db.query(PAIS, f"""
        SELECT * FROM {sap}.dbo.EXPEDICIONESCABECERA
        WHERE FECHACIERRE IS NULL AND NUMEROVIAJEWMH IS NULL
          AND TPEXES = 'DISP' AND TPEXSI = 'DISP'
          AND FECHAEXPEDICIONPLANIFICADA >= CAST(GETDATE() AS date)""", {})
    for r in rows:
        _upsert(r)
    return len(rows)
