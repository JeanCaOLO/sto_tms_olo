# 05 — Prioridad del OMS pisada por la ingesta entre barridos

**Estado:** pendiente por verificar

**Qué falta:** confirmar con Eduardo quién es dueño de `tbl_orders.priority` (y del `PRIORIDAD`
del espejo) para un pedido priorizado y aún no liberado.

**Por qué:** la ingesta (cada 10 min) sobrescribe `priority` con la de eFlow en los pedidos no
liberados (`ingest_orders._UPSERT`) y el sync del espejo hace lo mismo con `PRIORIDAD`. El OMS
re-prioriza en cada barrido (dev: cada 3 h), así que entre barridos se ve la prioridad de eFlow,
y su write-on-delta compara contra un valor que la ingesta ya cambió. No se observó en el ciclo
del 2026-11-12 porque los 47 priorizados se liberaron en el mismo barrido.

**Cómo:** si el OMS es dueño, en `_UPSERT` usar
`priority = CASE WHEN orders.prioritization_run_id IS NULL THEN EXCLUDED.priority ELSE orders.priority END`
y agregar `PRIORIDAD` a `_NO_PISAR` en `sim_eflow_sync.py` para filas ya priorizadas.
