# Registro de cambios — Fase 1 (bugs)

Todos los cambios son de frontend (`src/`). Estado al cierre: `type-check` limpio, vitest 769 pasados.

## Dinero con decimal.js
- `src/lib/tarifas/money.ts`: nuevos `parseMoneyInput`, `sumMoney`, `cmpMoney`, `pctToDisplay`, `exactNumber`; `toDecimal` rechaza NaN/Infinity.
- `pages/liquidaciones/page.tsx`: KPIs "Total liquidado" / "Sin aprobar" con `sumMoney` (antes `Number` + `reduce`); comparación de valor con `toDecimal`.
- `pages/companias/components/ImportSheetWizard.tsx`: total de importación con `sumMoney`.
- `rule-builder.ts`: `percentToFraction` con Decimal (1.1 % → `0.011`, antes `0.011000000000000001`); validación de piso/tope numérica.
- `costSheetParser.ts`: `parseAmount` sin pasar por `number` (sin notación exponencial, sin perder cifras).
- `costTemplate.ts`, `rateImport.ts`, `format.ts`, `CalcBreakdownPanel.tsx`, `CostStructureModal.tsx`: montos y comparaciones con Decimal.
- `tripOrders.ts`: `cargoFromOrders` suma valor/peso/volumen con Decimal y ya no redondea a 2 decimales por pedido.
- `resolver.ts`, `customVarFields.ts`: variables personalizadas numéricas vía `exactNumber` (sin perder precisión; la coma ambigua "1,234" es error de campo).
- `catalogLoader.ts` + `types.ts` (`MarginPolicy`): umbrales de margen como string decimal exacto.

## Bugs de datos y lógica
- `catalogLoader.ts`: `loadRateTables` ahora carga `valueColumns` y `extra_values` (antes toda regla con `column` caía al respaldo).
- `rateTablesDataSource.ts`: `bulkUpsertRows` y `saveRateTable` (reacomodo de filas) dentro de `db().transaction`; claves repetidas dentro del archivo se deduplican (gana la última).
- `TarifariosTab.tsx`: `fleetType` sugiere `OWN`/`OUTSOURCED`; `{error}` de activar/eliminar ya no se ignora.
- `RateTableModal.tsx`: no degrada un tarifario de compañía a país si la lista de compañías no cargó.
- `CountrySettingsCard.tsx`: reinicia el formulario por país; campo vacío ya no se guarda como 0.
- `PlantillasTab.tsx`: editar conserva `expectedTotal`, `customVars`, `quotedAt`; permisos y `saving`.
- `ImportRateTableModal.tsx`: confirmación explícita de "Reemplazar todo"; bloquea filas omitidas/duplicadas sin reconocimiento; actor real en la bitácora.
- `settlementsDataSource.ts`: colisión de número `LIQ-` distinguida de "ya hay vigente"; reintento con número nuevo; transiciones de estado (no reactivar anuladas, Pagado solo → Anulado).
- `LiquidarViajeModal.tsx`: reinicia exclusiones al recalcular; ignora cálculos superados.

## Validaciones de formulario
- `rule-builder.ts`: tramos (orden, único tramo abierto al final), BETWEEN numérico, % ≤ 100 al disminuir, `ruleCode` obligatorio, `blockSize` entero.
- `RuleModal.tsx`, `ZoneGroupModal.tsx`: trim, formato de código, `exclusion_group` en MAX, duplicado por `23505`.
- `MargenPolicyTab.tsx`: umbrales 0..1, crítico ≤ advertencia, acepta coma, errores visibles.
- `partyVariablesDataSource.ts`: rechaza Infinity/hex.

## Hooks, estados, shim, rutas
- `reglas-tarifa/page.tsx`, `ResumenTab`, `CostosTab`, `BitacoraTab`, `RuleTester`, `CostTemplateModal`: cancelación/guardas de carrera, error por cargador, sin spinner infinito, fecha local (`localDate.ts`, antes UTC).
- `DeleteConfirmModal.tsx`: prop `busy` (evita doble borrado).
- `hooks/useActiveCountry.ts`, `useAuth.tsx`, `useOperationalContext.tsx`: errores capturados, `loading` nunca queda colgado.
- `lib/supabase.ts`: `getSession` solo limpia sesión en 401/403; errores de red devueltos como `{error}`; `update`/`delete` sin filtro se rechazan; `in([])` devuelve vacío.
- `lib/tarifas/data/index.ts`: en build de producción sin `VITE_TARIFAS_DATASOURCE` usa `http` (antes caía en silencio al driver JSON/localStorage).
- `components/feature/module-routes.ts`: `permKeyForPath` normaliza barra final y mayúsculas (la guarda se saltaba con `/liquidaciones/`).

## Revisado y corregido sobre el trabajo de los agentes
- Se revirtió el endurecimiento Borrador→Pagado (un test existente lo declara flujo válido; es decisión de negocio, no bug).
- `isNumberCollision` marcaba toda violación de unicidad como colisión de número; ahora consulta si el viaje ya tiene vigente.
- `supabase.ts`: `RequestInit` no definido (lint) → `Parameters<typeof fetch>[1]`.
- `ResumenTab.tsx`: faltaba `import type Stage`.
