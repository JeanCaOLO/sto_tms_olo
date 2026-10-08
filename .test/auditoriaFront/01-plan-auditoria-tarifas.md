# Plan: auditoría y corrección del módulo Tarifas (liquidación)

## Context
Auditoría del frontend de Tarifas (`src/lib/tarifas`, `src/pages/reglas-tarifa`, `src/pages/liquidaciones`, `src/pages/companias`, `src/components/tarifas`). Tres exploraciones encontraron: (a) el núcleo del motor ya usa `decimal.js`, pero hay violaciones en bordes/presentación; (b) bugs reales de datos y validación; (c) no existe la capa Page→useController→Api y >30 archivos superan los límites de `standards/code-quality.md`. Decisión del usuario: **bugs primero, refactor por fases con aprobación entre fases; aplicar en el repo y entregar resumen + diffs clave.** Ejecutar en rama `dylan-tarifas`; sin commits salvo petición.

## Fase 1 — Bugs (esta fase)

### 1A. Dinero con decimal.js
- `src/lib/tarifas/money.ts`: añadir `sumMoney`, `cmpMoney`, `pctToDisplay`, `parseMoneyInput`; `toDecimal` valida NaN/Infinity.
- `src/pages/liquidaciones/page.tsx:165-169,339-340`: KPIs con `addAll`/`roundToMoney` (usa decimales del país). También `:80`, accessors.
- `src/pages/companias/components/ImportSheetWizard.tsx:123`: total con `addAll`.
- `rule-builder.ts:133` (`percentToFraction`) y `:113` (clamp): Decimal con try/catch.
- `costSheetParser.ts:110` (`parseAmount`): Decimal, sin pasar por `number`.
- `costTemplate.ts` (137-140,186,192,240,283): montos como string/Decimal.
- `tripOrders.ts:98-113`: acumular en Decimal, redondear una vez al final con decimales del país; pesos/volúmenes en Decimal.
- `MargenPolicyTab.tsx:56-58` + `catalogLoader.ts:168-170`: umbrales como string Decimal.
- `format.ts:25,143,151`, `CalcBreakdownPanel.tsx:46-47`, `rateImport.ts:142`, `TripOrdersPanel.tsx:80`, `CostStructureModal.tsx:279`: presentación/comparaciones con Decimal.

### 1B. Bugs de lógica/datos (altos)
- `catalogLoader.ts:229-258`: `loadRateTables` debe mapear `valueColumns` y `values` (extra_values); hoy columnas extra siempre caen al fallback.
- `rateTablesDataSource.ts:511-543,220-257`: `bulkUpsertRows` (replace) y `saveRateTable` dentro de `db().transaction` (patrón de `costStructureDataSource`).
- `ImportRateTableModal.tsx`: confirmación en "Reemplazar todo"; bloquear import si hay `skipped`/duplicadas.
- `TarifariosTab.tsx:155-156`: valores `OWN`/`OUTSOURCED` (no PROPIA/TERCERO); `:200-234` manejar `{error}` (try/catch muerto).
- `RateTableModal.tsx:103-105,149`: no degradar tarifario de compañía a país si `parties` no cargó.
- `CountrySettingsCard.tsx:42-48`: resetear form al cambiar de país sin settings; `:59-68` no guardar 0 por campo vacío.
- `PlantillasTab.tsx:72-78`: edición conserva `expectedTotal`, `customVars`, `quotedAt`; añadir `useModulePermissions` y flag `saving`.
- `LiquidarViajeModal.tsx`: reset de `excludedSeqs` al recalcular, `setPending(true)` en `onChanged`, ignorar cálculo superado.
- `settlementsDataSource.ts`: error de unicidad de número `LIQ-` no debe mapearse a `BASE_NO_DISPONIBLE`; máquina de estados básica en `updateSettlementStatus`.
- Auditoría: `registrarEvento` que falla no debe mostrar error tras operación exitosa (RuleModal, ZoneGroupModal, ImportRateTableModal, page); actor real en vez de `'Usuario simulado'`.

### 1C. Validaciones de formularios
- `rule-builder.ts`: tramos (orden ascendente, único `null` al final, `upTo` ≥ 0), clamp/BETWEEN numéricos, % ≤ 100 en DECREASE, `ruleCode` obligatorio en percentBase, `blockSize` entero.
- `RuleModal.tsx`: trim de código/nombre, formato de código, `exclusion_group` obligatorio en MAX, duplicado por `error.code==='23505'`, sync de pestañas Simple/Avanzado.
- `MargenPolicyTab.tsx`: rango 0..1, `critical ≤ warn`, aceptar coma decimal; try/catch/finally y feedback en `load`/`handleSave`; no pisar edición al recargar.
- `ZoneGroupModal.tsx`: trim antes de validar, mínimo una zona.
- `partyVariablesDataSource.ts:92-96`: rechazar Infinity/hex.

### 1D. Hooks, estados, shim y TypeScript
- Cancelación/guardas de carrera + loading/error/vacío en: `reglas-tarifa/page.tsx`, `ResumenTab`, `CostosTab`, `TarifariosTab` (deps por id, no por objeto), `liquidaciones/page.tsx` (`!countryId` no deja spinner), `useActiveCountry`, `useAuth` (`.catch`), `useOperationalContext`.
- `DeleteConfirmModal`: prop `busy`; evitar doble borrado.
- Fecha local en vez de `toISOString().slice(0,10)` (UTC) en page y `RuleTester`.
- `src/lib/supabase.ts`: `getSession` solo limpia sesión en 401/403, captura errores de red, `body` null-safe, `error` string-compat; `data/index.ts:48-50` no caer silenciosamente a driver `json` en producción.
- Tipado: eliminar `any` explícitos (lista en hallazgos: page, RuleModal, ZoneGroupModal, PlantillasTab, MargenPolicyTab, ResumenTab, BitacoraTab, `data/datasource.ts:16` `Row`, `supabase.ts:66,210`); revisar `eslint-disable exhaustive-deps` y corregir deps.
- Rutas: normalizar barra final en `permKeyForPath` (`module-routes.ts`) para no saltarse `RouteGuard`; verificar primero con prueba.

## Fase 2 — Arquitectura y tamaño (no ejecutar sin aprobación)
Patrón OMS (`src/pages/oms/**/use*Controller.ts` + `api`): crear `useLiquidacionesController`, `useReglasTarifaController` y capa `api` fina sobre datasources. Particionar, orden de impacto: `RuleModal` (1151), `RuleTester`, `LiquidarViajeModal`, `CostStructureModal`, `TarifariosTab`, `ImportRateTableModal`, `ImportSheetWizard`, `reglas-tarifa/page`, `liquidaciones/page`; luego datasources (`rateTablesDataSource`, `settlementsDataSource`, `costStructureDataSource`) y módulos (`types`, `evaluator`, `rule-builder`). Extraer `Modal` base accesible a `components/base` (role=dialog, Esc, aria-label). i18n y reglas ESLint de límites quedan como Fase 3.

## Verificación
- `npm run type-check` y `npm run lint` sin errores nuevos.
- `npx vitest run src/lib/tarifas` (hay suites para evaluator, rateTable, settlements, rule-builder, etc.); añadir tests de regresión: `loadRateTables` con `valueColumns`, `percentToFraction('1.1')`, `parseAmount` precisión, suma de KPIs con centavos, tramos inválidos, `cargoFromOrders` redondeo.
- Prueba manual en `/liquidaciones`, `/reglas-tarifa` (importar tarifario con columna de valor extra; fallo simulado a mitad de import) y `/liquidaciones/` con barra final.
- Entrega final: resumen ejecutivo, matriz de errores (Archivo / Tipo / Gravedad) y diffs clave.
