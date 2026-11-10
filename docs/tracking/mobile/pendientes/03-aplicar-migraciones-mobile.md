# 03 — Aplicar migraciones `m04`–`m08`

**Estado:** pendiente por verificar (requiere Intelix y Aurora).

## Qué falta

`TRACKING_TMS/DEPLOY.md` confirma `m01`–`m03` aplicadas en Aurora. No hay constancia de `m04` (`photo_product`), `m05` (`stop_type`), `m06` (visitas por parada), `m07` (acceso del rol Cliente) ni `m08` (`photo_return`). Las de visitas y cliente ya están en [`../../pendientes/02`](../../pendientes/02-aplicar-migraciones-y-prueba-e2e.md).

## Por qué

Sin `m06` `positions.record_visits` falla; sin `m08` no se puede subir la foto de una devolución; sin `m05`/`m04` no hay recolecta (ver [02](./02-recolecta-sin-probar-sandbox.md)).

## Cómo hacerlo

1. Verificar el estado: comprobar en Aurora que existen `tbl_tracking_stop_visits`, `tbl_tracking_client_access`, la columna `dispatch_guides.stop_type` y los valores permitidos de `ck_tracking_evidence_kind`.
2. Aplicar las faltantes con `backend/mobile/scripts/migrate.py` (credenciales `DB_ADMIN_*`; las ejecuta Intelix en QA/producción). Orden `m04 → m08`.
3. Actualizar `DEPLOY.md` y la tabla de estado de [`../README.md`](../README.md).
