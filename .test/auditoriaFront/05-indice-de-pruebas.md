# Índice de pruebas de la auditoría

Las pruebas viven junto al código (vitest solo recoge `src/**/*.test.ts(x)`); aquí se indexan.

| Archivo | Cubre |
|---|---|
| `src/lib/tarifas/__tests__/moneyPrecision.test.ts` | helpers de `money.ts`, `parseAmount`, `percentToFraction`, piso/tope, `cargoFromOrders`, `bulkUpsertRows` (dedupe) |
| `src/lib/tarifas/__tests__/ruleBuilderValidation.test.ts` | validación de tramos, BETWEEN, porcentajes, `blockSize` |
| `src/lib/tarifas/__tests__/partyVariablesValidation.test.ts` | variables numéricas: Infinity/hex/NaN |
| `src/lib/tarifas/__tests__/customVarPrecision.test.ts` | `exactNumber`, `parseCustomVarValues`, `resolveCustomVars` |
| `src/components/feature/module-routes.test.ts` | `permKeyForPath` con barra final y mayúsculas |

| `src/components/base/Modal.test.tsx` | `Modal` base: `role="dialog"`, Esc, clic en fondo, foco atrapado y devuelto |
| `src/pages/companias/components/CostStructureModal.test.tsx` | (existente) ahora mockea `useAuth` por el usuario real en la bitácora |

| `src/components/tarifas/CalcBreakdownPanel.test.tsx` | Caracterización del desglose (7 snapshots) |
| `src/pages/companias/components/VariablesModal.test.tsx` | Interacciones del modal de variables (10 casos) |
| `src/pages/companias/components/ImportSheetWizard.test.tsx` | Los 4 pasos del asistente con un CSV real (11 casos) |
| `src/pages/companias/components/CostStructureModal.interactions.test.tsx` | Copiar estructura del país, filas, parámetros, plantilla e importación (15 casos) |

Pendiente: tests de los controllers nuevos (`useLiquidacionesController`, `useReglasTarifaController`) y pruebas de caracterización de `CostStructureModal`, `ImportSheetWizard`, `VariablesModal` y `CalcBreakdownPanel` antes de partirlos.

## Ejecutar
```
npx vitest run src/lib/tarifas src/components/feature
npx vitest run            # suite completa
```

## Pruebas añadidas al cerrar la Fase 2 (2026-10-07)
| Archivo | Qué fija |
|---|---|
| `src/pages/reglas-tarifa/components/RuleTester.test.tsx` | Probador del motor (11 casos) |
| `src/pages/reglas-tarifa/components/ZoneGroupModal.test.tsx` | Grupos de zonas (15 casos); corre igual sobre HEAD |
| `src/pages/reglas-tarifa/components/TarifariosTab.test.tsx` | Lista, filas, permisos y borrado (9 casos, 3 snapshots) |
| `src/pages/reglas-tarifa/components/RateTableModal.test.tsx` | Alta/edición de tarifarios (14 casos, 4 snapshots) |
| `src/pages/reglas-tarifa/components/ImportRateTableModal.test.tsx` | Importación de filas (9 casos, 3 snapshots) |
| `src/pages/companias/components/CompaniasTable.test.tsx` | Tabla de compañías (6 casos) |
| `src/pages/liquidaciones/components/LiquidarViajeModal.snap.test.tsx` | Modal de liquidar: simple/extendida, exclusiones, emitir (4 casos, 2 snapshots) |
| `src/components/tarifas/CostTemplateModal.test.tsx` | Subida de plantilla con .xlsx real (5 casos, 2 snapshots) |

Aviso: nunca correr `src/__tests__` con el túnel a Aurora activo (escribe en la BD real).
