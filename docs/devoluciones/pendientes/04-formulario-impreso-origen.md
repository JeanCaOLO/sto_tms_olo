# 04 — Formulario impreso: mostrar origen y foto

**Estado:** idea.

## Qué falta
`ReturnFormModal.tsx` (línea ~98) y `formDocument.ts` (línea ~44) rotulan «Tipo:» con los **motivos** de las líneas, no con el origen (contracamión/recolecta). La foto tampoco sale en el documento.

## Cómo hacerlo
Agregar `returnTypeLabel(line.return_type)` (en `src/lib/devoluciones/trips.ts`) al documento y decidir si «Tipo» se renombra a «Motivo».
