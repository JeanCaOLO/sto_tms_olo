# 04 — Formulario impreso: mostrar origen y foto

**Estado (2026-11-11):** parcialmente resuelto. Origen y Motivo ya se muestran en `formDocument.ts` y el modal. Falta decidir/incluir la foto y contrastar visualmente el comprobante con el PDF. Ver P3/F07 de [estado actual](../ESTADO_ACTUAL.md).

## Qué falta
La foto todavía no sale en el documento. El problema anterior de confundir origen y motivo ya está resuelto localmente; no volver a implementarlo.

## Cómo hacerlo
Definir si el comprobante debe incluir fotos, su disposición y su carga segura para impresión. Verificar diseño con el ejemplo antes de cerrar QA visual.
