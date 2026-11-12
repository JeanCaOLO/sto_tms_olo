# 03 — Cola del OMS con pedidos que eFlow movió antes de liberar

**Estado:** pendiente por implementar (dueño: Eduardo, OMS)

**Qué falta:** si un pedido planificado y no liberado sale de la cola DISP/DISP de eFlow
(alguien lo movió directo en eFlow), la ingesta copia su estado real (`salientes.py`) y sale
de la bandeja, pero la cola del OMS lo sigue tomando: filtra solo
`planning_run_id IS NOT NULL AND oms_processed_at IS NULL`, sin mirar la situación.

**Por qué:** el OMS podría priorizar/liberar un pedido que eFlow ya cerró. Al 2026-11-11 hay 0
casos en cola, pero nada lo impide. `verif_oms.py` (2026-11-12) ve 8 priorizados-no-liberados fuera
de DISP, todos del 2026-11-10 y ya fuera de la cola (el replan les limpió `planning_run_id`).

**Cómo:** en `backend/oms/src/cola_candidatos.py` (`COLA_SQL`) agregar
`AND o.wms_status = 'DISP' AND o.wms_situation = 'DISP'`. Es código del OMS: lo decide Eduardo.
