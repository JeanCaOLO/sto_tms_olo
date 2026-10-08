# Registro — Ronda 2, Fase F (tablas con 5 filas visibles y scroll interno)

Fecha: 2026-10-08.

- `components/base/DataTable.tsx`: prop opcional **`maxVisibleRows`**. Con ella el contenedor limita su alto (`2.75rem` de encabezado + `3.25rem` por fila), se desplaza por dentro (`overflow-auto`) y el encabezado queda fijo (`sticky top-0`, también las columnas de expandir y acciones). El menú de filtro de cada columna pasa a dibujarse flotando en el `<body>` (portal, `position: fixed` bajo el botón) para que el scroll no lo recorte. **Sin la prop el DOM es idéntico al anterior.**
- Activado con `maxVisibleRows={5}` en: viajes por liquidar e historial, pedidos del viaje, reglas, lista de tarifarios, filas de tarifario, bitácora, compañías, filas de la estructura de costos y resumen por camión, reparto por casa comercial.
- Pruebas nuevas en `DataTable.test.tsx` (3): alto máximo + scroll + encabezado fijo con la prop; sin la prop no cambia; el filtro flota fuera de la tabla.
- 14 snapshots regenerados (7 archivos): la ÚNICA diferencia es `overflow-x-auto` → `overflow-auto` + `max-height` y las clases `sticky top-0 z-10 bg-slate-50` en los encabezados.
- No se tocaron: tablas manuales (`<table>`) dentro de modales y del desglose (ya viven en modales con scroll propio) ni la proforma imprimible.
- Verificación: tsc 0 · vitest 919 pasadas · eslint 0 errores.
