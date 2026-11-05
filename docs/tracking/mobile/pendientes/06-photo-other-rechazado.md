# 06 — `photo_other` permitido en BD pero rechazado por el servidor

**Estado:** pendiente por implementar (limpieza menor).

## Qué falta

Los CHECK de `m04_photo_product.sql` y `m08_photo_return.sql` (`ck_tracking_evidence_kind`) aún admiten `photo_other`, pero `logic.EVIDENCE_KINDS` (`logic.py:44`) no lo incluye y el servidor responde 400 «kind debe ser uno de…».

## Por qué

La web no muestra `photo_other`; se rechazó para no guardar fotos que nadie ve. El CHECK queda inconsistente con el contrato.

## Cómo hacerlo

- O bien una migración `m09` que quite `photo_other` del CHECK (verificar antes que no existan filas con ese valor).
- O bien documentarlo como reservado y dejar el CHECK. Elegir una; hoy `api-movil-v1.md` y `evidencias-y-devoluciones.md` lo describen como rechazado.
