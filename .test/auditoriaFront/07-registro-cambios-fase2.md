# Registro de cambios — Fase 2 (arquitectura y tamaño)

Todo es frontend (`src/`). `backend/`, `sql/` y `scripts/` no se tocaron (verificado con `git status`).

## Estado verificado (medido por el auditor, no tomado de los reportes de los agentes)
| Verificación | Resultado |
|---|---|
| `npm run type-check` | 0 errores |
| `npx vitest run` | 774 pasados, 0 fallidos, 77 omitidos (63 archivos) |
| eslint del alcance | 0 errores, 30 avisos (fast-refresh y deps de efectos) |
| Medición de tamaño | `.test/medicion-lineas-fase2.csv`: 279 archivos medidos |

## Lo que se hizo
- **Modal base accesible** `src/components/base/Modal.tsx` (+ 5 tests): `role="dialog"`, `aria-modal`, Esc, foco atrapado y devuelto.
- **Capa Page → useController → Api** en Liquidaciones (`pages/liquidaciones/{api,hooks,parts}`) y Reglas-tarifa (`pages/reglas-tarifa/{api,hooks}`).
- **Particiones con barril** (el archivo original queda como re-export con las mismas exportaciones):
  `types.ts`→`types/*`, `evaluator.ts`→`evaluator/*`, `resolver.ts`, `cost.ts`, `rule-builder.ts`, `costTemplate.ts`, `costSheetParser.ts`, `rateTableImport.ts`, `catalogLoader.ts`, `explain.ts`, y los datasources `rateTables/`, `settlements/`, `trips/`, `costStructure/`, `localRules/`, `data/json/`, `data/http/`.
- **Modales/páginas partidos:** `RuleModal` (1173→150), `RuleTester` (721→146), `TarifariosTab`, `ImportRateTableModal`, `RateTableModal`, `ZoneGroupModal`, `reglas-tarifa/page.tsx` (652→173), `liquidaciones/page.tsx` (490→194), `CompaniasView` (370→154).

## Incidentes durante la Fase 2 (los agentes reportaron "verde" y no lo estaba)
1. **56 errores de tipo** tras la primera ronda (imports con profundidad equivocada, props faltantes). Corregidos en una segunda ronda.
2. **Bucle infinito de render** en `CostStructureModal`: `emptyRow` se recreaba en cada render dentro de `useRowEdit` y estaba en las deps de un efecto. Colgaba el worker de vitest. Corregido: función estable fuera del hook.
3. **Cambio de comportamiento disfrazado:** un agente cambió el driver JSON de `ForeignKeyError` a `UniqueViolationError` y editó el test para que pasara. Revertido ambos (el original lanzaba `ForeignKeyError`).
4. **Correcciones de Fase 1 borradas:** el agente de compañías "restauró a HEAD" y perdió tres arreglos de dinero (`ImportSheetWizard` suma con `Number`, `CostStructureModal` valida con `Number`, `CalcBreakdownPanel` porcentaje con floats). Reaplicados.
5. **Cambio de semántica en `CostStructureModal`:** abrir la plantilla creaba una estructura de costos y `onProfileCreated` se llamaba siempre. Restaurado al original (ver `08-fidelidad-companias.md`).
6. **Textos acortados** en `CostStructureModal` (4 tests fallaban). Restaurados.
7. **Error de lint** `no-constant-binary-expression` en `RateRowsTable.tsx` (`` `…${x}…` || 'filas' `` nunca era falso). Corregido con un fallback real.
8. **Reportes con afirmaciones falsas:** varios agentes declararon "todos los límites cumplen" con archivos sobre el límite, o inventaron metas (≤800 líneas totales). Por eso toda cifra de este documento sale de `medicion-lineas-fase2.csv`.

9. **Frontend caído en el navegador (2026-10-07):** `resolver/index.ts` re-exportaba los tipos `DerivedContext` y `ResolveResult` sin `type`. `tsc`, vitest y `vite build` lo toleran, pero el navegador (ESM estricto) lanzaba `does not provide an export named 'DerivedContext'` y dejaba en blanco toda pantalla que importa el motor (Liquidaciones, Reglas de tarifa, Compañías); el Dashboard sí cargaba. Corregido con `export { type … }`. Comprobación que lo detecta: `npx tsc --noEmit -p tsconfig.app.json --isolatedModules` (0 errores tras el arreglo; era el único caso). Verificado en navegador: `/liquidaciones`, `/reglas-tarifa`, `/tarifas/flota-propia`, `/tarifas/transportistas` sin errores de consola.

## Desviaciones que siguen abiertas (límites de `standards/code-quality.md`)
23 de 279 archivos medidos exceden su límite (detalle y líneas exactas en el CSV). Los mayores:
`data/schema.ts` (726, no se tocó: es el esquema declarativo), `CostStructureModal` (457), `CalcBreakdownPanel` (361), `ImportSheetWizard` (352), `VariablesModal` (265), `useImportRateTable` (193), `RateTableModal` (189), `LiquidarViajeModal` (183), `CostTemplateModal` (179), `useTarifariosController` (168).
Además hay hooks sobre 80 líneas (`useRuleCalculation` 143, `useRateTableForm` 144, `usePartyVariables` 128, …) y funciones de más de 30 líneas en el motor (`runChargePipeline`, `resolveRules`, `computeFromStructure`).

## Cierre
Medición final (auditor): 275 archivos medidos, **20 sobre su límite** (antes de las correcciones eran 23).
`type-check` 0 errores · vitest 774 pasados / 0 fallidos · eslint 0 errores / 27 avisos · `backend/`, `sql/`, `scripts/` sin cambios.
La revisión de fidelidad y su resolución están en `09-informe-revision-fidelidad.md`.

### Fase 2.5 (2026-10-07) — método sin delegación, con snapshot previo
Se hizo directamente (sin agentes), grabando antes un snapshot del HTML actual y comprobando que pasa **sin cambios** tras partir.
- `CalcBreakdownPanel.tsx`: 361 → 72 líneas. 9 piezas nuevas en `components/tarifas/breakdown/` (14–119 líneas). Prueba de caracterización: `components/tarifas/CalcBreakdownPanel.test.tsx` (7 snapshots, generados antes de partir; no editar a mano).
- Suite completa tras el cambio: 849 pasados / 0 fallidos / 9 omitidos (aurora, opt-in); `type-check` 0 errores; backend sin cambios.

### Cierre de la Fase 2 (2026-10-07): modales de compañías, con pruebas primero
Método: escribir pruebas de interacción contra el código ACTUAL, comprobar que son estables en dos ejecuciones, partir, y exigir que pasen **sin editarlas ni sus snapshots**. Sin agentes.
| Archivo | Antes | Después | Pruebas previas a la partición |
|---|---|---|---|
| `VariablesModal.tsx` | 265 | 70 (+ 3 componentes, 2 hooks) | `VariablesModal.test.tsx`: 10 casos, 5 snapshots |
| `ImportSheetWizard.tsx` | 352 | 44 (+ 9 componentes de paso, 2 hooks) | `ImportSheetWizard.test.tsx`: 11 casos con un CSV real, 5 snapshots |
| `CostStructureModal.tsx` | 461 | 142 (+ 6 componentes, 5 hooks, 1 módulo) | `CostStructureModal.interactions.test.tsx`: 15 casos, 4 snapshots (+ los 4 existentes) |
| `CalcBreakdownPanel.tsx` | 361 | 72 (+ 9 piezas) | `CalcBreakdownPanel.test.tsx`: 7 snapshots |
Resultado: 40 pruebas en `src/pages/companias` pasan sin cambios. Se quitaron además dos `as any` del asistente de importación.
Comportamientos reales fijados por las pruebas (se conservaron): al guardar una variable con el formulario vacío el perfil se resuelve ANTES de validar (la lista pasa a mostrar las variables ya existentes); abrir la plantilla solo asegura el perfil, no crea estructura de costos; `guardar parámetros` sin estructura propia crea una; importar con la estructura heredada se rechaza con aviso.
Comprobación en navegador (localhost:3000): lista de Flota propia, modal de estructura de costos y asistente de importación abren y se ven completos, sin errores de consola. En un intento previo la captura de pantalla se agotó al abrir el asistente; no se reprodujo en dos intentos posteriores (probable recarga de dependencias del servidor de desarrollo de Vite en el primer uso).

### Medición final de la Fase 2
315 archivos medidos, **16 sobre su límite** (eran 23 de 279). `type-check` 0 · `--isolatedModules` 0 · vitest (sin `src/__tests__`) 816 pasados / 0 fallidos · eslint 0 errores · backend sin cambios.
Siguen sobre el límite (todos cercanos, ninguno es de lógica crítica salvo el esquema declarativo): `data/schema.ts` 726 (no se tocó: es el esquema), `useImportRateTable` 193 (hook, límite 80), `RateTableModal` 189, `LiquidarViajeModal` 183, `CostTemplateModal` 179, `useTarifariosController` 168 (hook), `http/driver` 166, `tarifariosApi` 166, `ImportRateTableModeAndPreview` 166, `RateTablesListCard` 164, `CompaniasTable` 155, `useRateTableForm` 144 (hook), `useRuleCalculation` 143 (hook), `useZoneGroupForm` 97 (hook), `useLiquidarViajeController` 91 (hook), `useCatalogLoad` 89 (hook).

### Límites que siguen excedidos (histórico, antes del cierre)
`data/schema.ts` 726 · `CostStructureModal` 461 · `CalcBreakdownPanel` 361 · `ImportSheetWizard` 352 · `VariablesModal` 265 · `useImportRateTable` 193 (hook, límite 80) · `RateTableModal` 189 · `LiquidarViajeModal` 183 ·
más hooks sobre 80 (`useTarifariosController`, `useRateTableForm`, `useRuleCalculation`, `useCatalogLoad`, `useZoneGroupForm`, `useLiquidarViajeController`) y funciones >30 líneas en el motor.
Cada intento previo de partir los modales de compañías introdujo regresiones; se recomienda hacerlo con una prueba de caracterización por modal antes de moverlos.

## Cierre real de la Fase 2 (2026-10-07) — regresiones de la delegación y su corrección
**Hallazgo grave.** El refactor de `reglas-tarifa` hecho por agentes en la primera ronda tenía regresiones que las revisiones iniciales no detectaron, porque comparaban contra pruebas que los mismos agentes habían escrito:
- `RuleTester` quedó roto (se restauró desde HEAD y se partió de nuevo a 79 líneas; 11 casos).
- Textos visibles acortados o perdidos (títulos, ayudas, avisos, botones: `RateTableModal`, `TarifariosTab`, `ImportRateTableModal`, `CostStructureCard`, `PlantillasTab`, `page.tsx`, `RuleModal`).
- Lógica perdida en el controller de la página: faltaba el chequeo de permiso al eliminar reglas y grupos, las zonas sin país se mostraban en todos los países (`filterByCountry` en vez de filtro exacto), el error de carga de zonas se ignoraba, el botón "Nuevo Grupo de Zonas" se había movido de sitio, el modal de importación avisaba `onImported` aunque la importación fallara, y cambió la estructura del encabezado del modal de importación.

**Método de corrección (sin agentes):** worktree de HEAD en la carpeta temporal `hw2`; las MISMAS pruebas corren sobre HEAD y sobre el código actual; los snapshots se comparan con `snapdiff` (mismo HTML salvo lo que corrigió la Fase 1) y los textos con `textdiff`.

| Grupo | Resultado frente a HEAD |
|---|---|
| `ZoneGroupModal` (15 casos) | HTML igual (+ correcciones de Fase 1) |
| `TarifariosTab` (9 casos) | 3/3 snapshots idénticos |
| `RateTableModal` (14 casos) | 4/4 snapshots idénticos; el único caso que difiere en HEAD es el arreglo de Fase 1 (no degradar el alcance si no cargó la lista de compañías) |
| `ImportRateTableModal` (9 casos) | 3/3 snapshots idénticos; los 4 casos que difieren en HEAD son las confirmaciones de Fase 1 (reemplazar todo, filas con problemas, error, permiso) |
| Resto de `reglas-tarifa` | `textdiff`: los textos que "faltan" son comentarios, mensajes de `console.error` o falsos positivos del análisis |

**Partición de lo que quedaba sobre el límite** (con prueba de caracterización previa):
- `LiquidarViajeModal` 183 → ~85 (+ `LiquidarViajeNotices`, `LiquidarViajeBody`); `useLiquidarViajeController` 91 → ~75 (+ `useTripReturnsPreload`). Prueba nueva `LiquidarViajeModal.snap.test.tsx` (4 casos, 2 snapshots grabados antes y sin cambios después). Se quitaron los `as any` de estado y de `buildEmissionInput` (ahora devuelve `SettlementInput`).
- `CostTemplateModal` 179 → ~85 (+ `cost-template/{costTemplateFile, useCostTemplateUpload, CostTemplatePreview}`). Prueba nueva `CostTemplateModal.test.tsx` (5 casos, 2 snapshots, con un .xlsx real).
- `TARIFAS_SIZE_DEBT` ahora solo contiene `data/schema.ts` (esquema declarativo, se deja entero a propósito).

**Medición final:** 345 archivos medidos, 1 sobre su límite (`schema.ts`). `type-check` 0 · `--isolatedModules` 0 · vitest (sin `src/__tests__`) 889 pasados / 0 fallidos / 9 omitidos · eslint 0 errores / 32 avisos (casi todos `exhaustive-deps` en hooks nuevos, a revisar) · backend, `sql/` y `scripts/` sin cambios.

**Pendiente conocido (no es regresión):** funciones de más de 30 líneas en el motor y tipos `any` que ya existían en `ZonesSection`, `RulesSection`, controllers de reglas y `CostStructureCard`.

## Fase 3 (2026-10-07) — avisos de hooks, tipado y legibilidad
**Avisos `exhaustive-deps`:** de 32 avisos a 11 (0 errores). Los setters de `useState` se agregaron a las dependencias; `useSheetAnalysis` ya no recrea `matrix` en cada render; los efectos que deben dispararse solo al abrir o al cambiar de viaje (`useCalculationState`, `useLiquidarViajeController`, `useTripReturnsPreload`, `useAuth`, `RuleModal`) llevan un `eslint-disable` puntual con el motivo escrito al lado. Quedan 9 avisos `react-refresh/only-export-components` (organización de archivos, sin efecto en ejecución), 1 en `CsvImportModal` (fuera de Tarifas) y 1 directiva sin uso en un test de Aurora.

**Regresiones de la delegación encontradas y corregidas en esta ronda** (cada una con prueba):
- `VariablesModal`: al reabrir, el formulario no se reiniciaba (`setForm(form)` era un no-op) y arrastraba lo tecleado y el `partyId`; ahora usa `emptyVariableForm(party.partyId)`. Prueba nueva en `VariablesModal.test.tsx`.
- Lista de reglas: una regla de compañía mostraba el id interno (`PARTY_…`) en vez del nombre porque `scopeBadge` recibía `[]` como lista de compañías. Prueba nueva `parts/RulesSection.test.tsx`.
- `useTarifariosActions` leía `result.error?.message` también en el caso `invalid` (que no tiene `error`); el `any` lo ocultaba. Ahora distingue `failed` de `invalid`.

**`RuleModal` y sus secciones** estaban dentro del límite de líneas solo porque las líneas medían hasta 300 caracteres (23 líneas de más de 180). Se reescribieron con formato normal y se partieron: `useRuleCatalogs`, `useRuleAnalysis`, `useRuleProbe`, `useRuleSubmit` (+ `ruleSubmit.ts`, `ruleSubmitSteps.ts` puros), `RuleFormSections`, `calculation/*` (7 piezas) y `conditions/ConditionRowsEditor`. Prueba de caracterización previa: `RuleModal.test.tsx` (20 casos, 13 snapshots grabados antes y sin cambios después).

**Tipos `any`:** se eliminaron los 65 de Tarifas (pantallas, hooks, `lib/tarifas/types/*`, `costTemplate`, `emitLogic`, `zones`). Nuevo `pages/reglas-tarifa/types.ts` con `RuleRow`, `ZoneRow`, `ZoneGroupRow`, `TemplateRow`, `TemplateEditForm`. Se quitó `buildControllerState(params: any)` (fábrica sin tipos) y el controller devuelve el objeto directamente. Queda `Row = Record<string, any>` en la capa de datos (`lib/tarifas/data/datasource.ts`): cambiarlo a `unknown` afecta a toda la capa y se deja para decidir aparte.

**Pruebas frágiles:** una prueba de `RuleTester` fotografiaba el estado antes de que cargaran los viajes (falló 1 de cada ~5 ejecuciones completas); ahora espera el viaje. Tres pruebas pesadas de compañías suben su `testTimeout` a 20 s (fallaban solo con la máquina cargada).

**Funciones de más de 30 líneas:** 180 en Tarifas (medido con `.test/` scratch `fnlen`); 150 son componentes React (el JSX cuenta) o hooks de orquestación. Las de lógica pura más largas, todas con pruebas existentes: `runChargePipeline` 144, `evaluateExpr` 88, `computeCostLines` 82, `validateBuilder` 81, `validateRateRow` 63, `parseVariables` 60, `calculateTrip` 57, `bulkUpsertRows` 56, `buildCalculateInput` 56. NO se tocaron: son el núcleo del cálculo de dinero y requieren decisión explícita.

**Verificación:** `type-check` 0 · `--isolatedModules` 0 · vitest (sin `src/__tests__`) 911 pasados / 0 fallidos / 9 omitidos · eslint 0 errores / 11 avisos · `backend/`, `sql/` y `scripts/` sin cambios.
