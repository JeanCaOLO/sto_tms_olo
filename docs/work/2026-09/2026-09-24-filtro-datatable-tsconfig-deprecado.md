# 2026-09-24 — Filtro por columna de DataTable y opción deprecada en `tsconfig.app.json`

## What changed
- `DataTable` (`src/components/base/DataTable.tsx`): el filtro por columna ahora funciona como se espera. Sin filtro no
  hay nada marcado; marcar un valor muestra solo ese valor; desmarcar el último quita el filtro. "Limpiar" y
  "Seleccionar todo" quitan el filtro. Test de regresión en `src/components/base/DataTable.test.tsx`. (Kiro)
- `tsconfig.app.json`: `"alwaysStrict": false` → `true`. (Claude)
- README y referencias de estado actual (`docs/reference/analisis-sistema-tms.md` §5.3,
  `docs/arquitectura-tms-oms/README.md`) actualizados: `/tiendas` ya usa `delivery_points` y `zones` existe.

## Why
- El usuario quería ver solo los puntos de entrega de EPA y el filtro no lo permitía: sin filtro el menú mostraba todos
  los valores marcados, así que un clic en "EPA" lo desmarcaba y dejaba solo Cofersa. Los datos y la API estaban bien
  (1582 puntos, Cofersa 1576 + EPA 6, todos con su cliente).
- `alwaysStrict=false` es una opción deprecada: TypeScript 6 da el error TS5107 y TypeScript 7 la elimina. No se admiten
  opciones deprecadas en la configuración.

## How
- Con `"alwaysStrict": true` el type-check sigue en los mismos 20 errores de antes, todos en otros módulos: no aparece
  ninguno nuevo, porque con `moduleDetection: force` todos los archivos ya son módulos ES, que siempre son estrictos.
  Con TypeScript 6, `tsconfig.app.json` y `tsconfig.node.json` ya no dan errores de deprecación.
- `strict` sigue en `false` globalmente (ver `project.md`: endurecer el tipado por subárbol, no de golpe).

## Promoted knowledge
- README, sección Arquitectura: todo listado usa `DataTable`, cómo funciona el filtro, y que no se admiten opciones
  deprecadas en `tsconfig.app.json`.

## Follow-ups
- [ ] 1 punto de Cofersa (`CO0190`) vino del WMS con el nombre vacío; corregirlo en el origen o en la próxima ingesta.
