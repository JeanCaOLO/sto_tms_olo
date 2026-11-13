"""Pedidos que SALIERON de la cola de eFlow: refleja su estado actual en `orders`.

La ingesta solo trae la cola DISP/DISP; si eFlow despacha, cierra o mete a un viaje
un pedido, deja de venir y en `orders` quedaba DISP/DISP para siempre (bandeja con
pedidos viejos). Aquí: los DISP/DISP de Aurora que no están en la cola se consultan
en eFlow por su llave y se copian TPEXES/TPEXSI → wms_status/wms_situation.
Si siguen DISP/DISP en eFlow (fecha vencida) no cambian: siguen pendientes de verdad.
Solo pedidos NO liberados: lo liberado por el OMS queda como lo dejó el OMS.
Read-only contra eFlow.
"""

from tms_common import eflow_db, pg

_EN_BANDEJA = """
SELECT eflow_id_expedicion AS exp, eflow_id_compania AS cia
FROM tbl_orders
WHERE organization_id = %s AND eflow_id_expedicion IS NOT NULL
  AND wms_status = 'DISP' AND wms_situation = 'DISP' AND oms_processed_at IS NULL"""

_UPD = """
UPDATE tbl_orders SET wms_status = %s, wms_situation = %s, updated_at = now()
WHERE organization_id = %s AND eflow_id_expedicion = %s AND eflow_id_compania = %s
  AND wms_status = 'DISP' AND wms_situation = 'DISP' AND oms_processed_at IS NULL"""

_LOTE = 200


def refrescar(pais: str, org: str, en_cola: set[tuple[str, str]]) -> int:
    """Actualiza los pedidos DISP/DISP de `org` fuera de `en_cola` {(expedición, compañía)}.
    Devuelve cuántos cambiaron de estado."""
    fuera = [(r["exp"], r["cia"]) for r in pg.query(_EN_BANDEJA, [org]) if (r["exp"], r["cia"]) not in en_cola]
    sap = eflow_db.db_names(pais).db_sap
    cambiados = 0
    for i in range(0, len(fuera), _LOTE):
        lote = fuera[i:i + _LOTE]
        params = {f"e{k}": exp for k, (exp, _) in enumerate(lote)}
        marcas = ",".join(f"%(e{k})s" for k in range(len(lote)))
        filas = eflow_db.query(pais, f"""SELECT IDEXPEDICION, IDCOMPANIA, TPEXES, TPEXSI
            FROM {sap}.dbo.EXPEDICIONESCABECERA WHERE IDEXPEDICION IN ({marcas})""", params)
        buscados = set(lote)
        for f in filas:
            llave = (str(f["IDEXPEDICION"]), str(f["IDCOMPANIA"]))
            if llave in buscados and (f["TPEXES"], f["TPEXSI"]) != ("DISP", "DISP"):
                pg.query(_UPD, [f["TPEXES"], f["TPEXSI"], org, *llave])
                cambiados += 1
    return cambiados
