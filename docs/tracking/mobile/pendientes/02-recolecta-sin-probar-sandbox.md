# 02 — Recolecta sin probar en el sandbox

**Estado:** pendiente por verificar.

## Qué falta

La transición de una parada `collection` (foto del producto `photo_product` + firma) está cubierta por pruebas con BD simulada pero **no se ha ejecutado contra Aurora ni desde el teléfono** (`TRACKING_TMS/PENDIENTES_BACKEND.md`). Depende de las migraciones `m04` (admite `photo_product`) y `m05` (`dispatch_guides.stop_type`), ver [03](./03-aplicar-migraciones-mobile.md).

## Por qué

El servidor decide qué evidencias exige según `stop_type` (`logic.REQUIRED_EVIDENCE`). Si `m04`/`m05` no están aplicadas, subir `photo_product` falla por el CHECK y toda recolecta quedaría bloqueada.

## Cómo hacerlo

1. Aplicar `m04` y `m05` (pendiente 03).
2. En el sandbox, marcar una guía como recolecta: `UPDATE dispatch_guides SET stop_type='collection' WHERE id = …`.
3. Desde el teléfono: foto de producto + firma + «Recolectado».
4. Comprobar: fila en `tbl_tracking_evidences` con `kind='photo_product'`, estado de la guía, evento y que el monitor web muestre «recolecta» con sus 2 evidencias.
5. Probar el 400 `evidence_required` entregando sin foto del producto.
