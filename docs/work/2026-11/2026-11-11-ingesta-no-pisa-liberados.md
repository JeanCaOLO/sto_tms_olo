# 2026-11-11 — La ingesta de la bandeja ya no toca pedidos liberados por el OMS

## Qué pasaba
- El OMS libera escribiendo `wms_situation='GENE'` solo en Aurora; el eFlow real sigue DISP/DISP.
- La ingesta (cada 10 min) traía ese pedido en la cola de eFlow y el upsert le devolvía DISP/DISP
  (y la prioridad de eFlow). Auditoría (`audit.tbl_events`): p. ej. P010210226111162781-M,
  19:12:53 OMS GENE/prio 0 → 19:18:03 ingesta DISP/prio 5.
- Luego, cuando eFlow lo movía, `salientes.py` le copiaba CHEQ/CERR, PREP, etc. → pedidos liberados
  con situaciones que el OMS no escribe (observación de Jesús; comentario de Eduardo).

## Cambio
- `backend/planning/src/ingest_orders.py`: `_UPSERT` con `WHERE orders.oms_processed_at IS NULL`
  en el `DO UPDATE`: liberado = congelado (ni estado, ni situación, ni datos).
- `backend/planning/src/salientes.py`: solo pedidos no liberados.
- `backend/tests/test_salientes.py`: test del guardado. Suite backend: 630 passed.

## Datos (Aurora sandbox `tms_olo`)
- Reparados a `wms_situation='GENE'` los liberados que estaban DISP/DISP: 169 + 11 (los 11 los
  escribió el proceso viejo de la ingesta a mitad de corrida al reiniciarlo). IDs en
  `2026-11-11-liberados-regenerados-ids.json` y `-ids-2.json`.
- Rollback: `UPDATE tbl_orders SET wms_situation='DISP' WHERE id = ANY(<ids>)`.
- No se tocaron los liberados con CHEQ/CERR, PREP, TERM (estado real copiado de eFlow).

## Verificación
- Ingesta local reiniciada con el código nuevo; corrida 19:23 UTC: 281 leídos, 6 salieron de la
  cola, 0 liberados en DISP/DISP.
- No desplegado al sandbox (el cron desplegado falla a propósito sin credenciales de eFlow).

## Pendientes
- `docs/planificacion/pendientes/03` (cola del OMS, decisión de Eduardo) y `04` (historial de
  modificaciones, idea).
