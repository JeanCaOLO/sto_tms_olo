# Registro — Fase 5 (descargar la liquidación en PDF con todo el desglose)

Fecha: 2026-10-08. Sin dependencias nuevas (el repo no tiene librería de PDF): se usa la impresión del navegador, que ofrece «Guardar como PDF».

## Qué se hizo
- `parts/ProformaImprimible.tsx` (nuevo): encabezado (número LIQ-, viaje, fecha, estado, forma de liquidar, total), datos del viaje, reparto por casa comercial (tabla simple), pedidos del viaje con su estado, devoluciones y el **desglose completo nivel auditoría** (`CalcBreakdownPanel fixedLevel="auditoria"`: etapas, línea por línea, reglas que no aplicaron, datos que entraron al cálculo, margen), y notas. Se arma del snapshot guardado: no recalcula.
- `hooks/usePrintProforma.tsx` (nuevo): monta la proforma en un `<div id="proforma-print-root">` fuera del árbol (portal en `<body>`), llama a `window.print()` y la retira en `afterprint`.
- `src/index.css`: reglas `@media print` que ocultan todo salvo la proforma; en pantalla el contenedor no se ve.
- `parts/settlementResult.ts` (nuevo): `settlementToResult` (lo que antes estaba inline en el detalle); ahora también rellena `cost.breakdown` con las líneas `COST_ROW` de la traza.
- `DetalleLiquidacionModal.tsx`: botón «Descargar PDF» en el pie.
- Al emitir, `emit` devuelve la liquidación guardada y `LiquidarViajeModal.onSaved(saved)` la entrega; `page.tsx` abre el detalle de la liquidación recién emitida (desglose + PDF) en lugar de cerrar sin más.

## Refactors por límites de lint (`max-lines`)
- `parts/VerMasSection.tsx` (extraído de `CalculationContent`: 165→132 líneas), `hooks/useLiquidationMethod.ts` y `hooks/useEditsUsed.ts` (extraídos del controller: 94→<80). Los snapshots de caracterización pasan SIN regenerarse tras estos cambios.

## Pruebas
- `parts/ProformaImprimible.test.tsx` (3): emitir entrega la liquidación guardada; la proforma trae viaje, reparto, pedidos y desglose de auditoría; «Descargar PDF» monta la proforma, llama a `window.print` y la retira en `afterprint`. Usa un viaje de los datos de ejemplo emitido de verdad.

## Límite
La verificación del PDF resultante (paginación, cortes, colores de impresión) se hace en la auditoría visual en navegador (Fase 6).
