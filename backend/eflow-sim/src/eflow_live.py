"""Fuente LIVE de las expediciones del sim: lee EFLOW real (read-only) y lo
mapea al shape del seed (EXPEDICIONESCABECERA/DETALLE del PDF de ePrac).

Solo GET. Los POST (write-back del nº de viaje) NO tocan EFLOW real: se simulan
en sim_source. Se activa con EFLOW_SIM_MODE=live (si no, el app usa el seed).

La "cola" = pedidos ABIERTOS y SIN viaje asignado (FECHACIERRE IS NULL AND
NUMEROVIAJEWMH IS NULL), acotada a EFLOW_SIM_LIMIT filas (13k+ en CR). Columnas
reales distintas al PDF: FECHAEXPEDICIONPLANIFICADA es la fecha de entrega del
cliente; NOMBRE/DIRECCION/coords salen de CLIENTES; detalle usa UNIDADESPEDIDAS/
PESOPEDIDO/CUBICAJEPEDIDO.
"""

import os

from tms_common import eflow_db

PAIS = os.environ.get("EFLOW_SIM_PAIS", "cr")
LIMITE = int(os.environ.get("EFLOW_SIM_LIMIT") or 300)

# Filtros del PDF que podemos empujar a SQL como igualdad (clave -> columna).
_EQ = {
    "IDEXPEDICION": "e.IDEXPEDICION", "IDCOMPANIA": "e.IDCOMPANIA",
    "IDALMACEN": "e.IDALMACEN", "IDSUCURSAL": "e.IDSUCURSAL",
    "TPEXES": "e.TPEXES", "TPEXSI": "e.TPEXSI", "PRIORIDAD": "e.PRIORIDAD",
}
# Cola real = abiertos, sin viaje, NO anulados y con entrega de hoy en adelante
# (el ASC puro traía expediciones muertas de 2019/2020).
_BASE = (
    "e.FECHACIERRE IS NULL AND e.NUMEROVIAJEWMH IS NULL "
    "AND e.TPEXSI <> 'ANUL' AND e.TPEXES <> 'ANUL' "
    "AND e.FECHAEXPEDICIONPLANIFICADA >= CAST(GETDATE() AS date)"
)
_ORDEN = "ORDER BY e.FECHAEXPEDICIONPLANIFICADA"


def _where(filtros: dict) -> tuple[str, dict]:
    cond = [_BASE]
    params: dict = {"limite": LIMITE}
    for clave, col in _EQ.items():
        if filtros.get(clave) not in (None, ""):
            cond.append(f"{col} = %({clave})s")
            params[clave] = filtros[clave]
    return " AND ".join(cond), params


def _cols_sap() -> str:
    return eflow_db.db_names(PAIS).db_sap


def cabecera(filtros: dict) -> list[dict]:
    sap = _cols_sap()
    where, params = _where(filtros)
    sql = f"""
SELECT TOP (%(limite)s)
  e.IDEXPEDICION, e.IDCOMPANIA, e.IDALMACEN, e.IDSUCURSAL,
  e.TPEXES, e.TPEXSI, e.PRIORIDAD, e.BAJADA, e.IDCLIENTE,
  cl.NOMBRELARGO AS NOMBRECLIENTE, e.RUTA,
  CONVERT(varchar(10), e.FECHAEXPEDICIONPLANIFICADA, 23) AS FECHAENTREGA,
  CONVERT(varchar(10), e.FECHACIERRE, 23) AS FECHACIERRE,
  e.NUMEROVIAJEWMH, cl.DIRECCIONLARGA AS DIRECCIONENTREGA,
  cl.LATITUD, cl.LONGITUD
FROM {sap}.dbo.EXPEDICIONESCABECERA e
LEFT JOIN {sap}.dbo.CLIENTES cl
  ON cl.IDCLIENTE = e.IDCLIENTE AND cl.IDCOMPANIA = e.IDCOMPANIA
WHERE {where}
{_ORDEN}"""
    return eflow_db.query(PAIS, sql, params)


def detalle(filtros: dict) -> list[dict]:
    sap = _cols_sap()
    where, params = _where(filtros)
    sql = f"""
SELECT
  d.IDEXPEDICION, d.IDCOMPANIA, d.IDALMACEN, d.IDSUCURSAL,
  d.IDEXPEDICIONLINEA AS IDLINEA, d.IDARTICULO,
  CAST(NULL AS varchar(1)) AS DESCRIPCION, d.UNIDADESPEDIDAS AS CANTIDAD,
  d.PESOPEDIDO AS PESO, d.CUBICAJEPEDIDO AS VOLUMEN,
  d.GUIAFISCAL, d.TPEXES, d.TPEXSI, CAST(NULL AS int) AS PRIORIDAD
FROM {sap}.dbo.EXPEDICIONESDETALLE d
INNER JOIN (
  SELECT TOP (%(limite)s) e.IDEXPEDICION, e.IDCOMPANIA, e.IDALMACEN, e.IDSUCURSAL
  FROM {sap}.dbo.EXPEDICIONESCABECERA e
  WHERE {where}
  {_ORDEN}
) e ON e.IDEXPEDICION = d.IDEXPEDICION AND e.IDCOMPANIA = d.IDCOMPANIA
   AND e.IDALMACEN = d.IDALMACEN AND e.IDSUCURSAL = d.IDSUCURSAL"""
    return eflow_db.query(PAIS, sql, params)
