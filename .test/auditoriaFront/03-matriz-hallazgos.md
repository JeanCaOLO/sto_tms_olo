# Matriz de hallazgos

Estado: ✅ corregido · 🟡 mitigado/documentado · ⏳ Fase 2 · 🔧 requiere backend

| Archivo | Tipo | Gravedad | Estado |
|---|---|---|---|
| `catalogLoader.ts` | Bug: columnas de valor no cargadas | Alta | ✅ |
| `rateTablesDataSource.ts` | Bug: borrado/carga sin transacción | Alta | ✅ |
| `liquidaciones/page.tsx` | Dinero: KPIs con `Number` | Alta | ✅ |
| `ImportSheetWizard.tsx` | Dinero: total con floats | Alta | ✅ |
| `TarifariosTab.tsx` | Lógica: `PROPIA/TERCERO` inválidos; errores ignorados | Alta | ✅ |
| `MargenPolicyTab.tsx` | Validación + spinner infinito + errores ignorados | Alta | ✅ |
| `CountrySettingsCard.tsx` | Bug: arrastra valores de otro país; vacío = 0 | Alta | ✅ |
| `PlantillasTab.tsx` | Bug: edición borra `expectedTotal`/`customVars`; sin permisos | Alta | ✅ |
| `ImportRateTableModal.tsx` | Pérdida de datos sin confirmación | Alta | ✅ |
| `RateTableModal.tsx` | Bug: tarifario de compañía pasa a país | Alta | ✅ |
| `lib/supabase.ts` | Shim: logout por 5xx, rechazos sin capturar | Alta | ✅ |
| `module-routes.ts` | Guarda de ruta saltable (`/liquidaciones/`) | Media | ✅ |
| `rule-builder.ts`, `costSheetParser.ts`, `tripOrders.ts`, `costTemplate.ts` | Dinero por `number` | Media | ✅ |
| `resolver.ts`, `customVarFields.ts`, `catalogLoader.ts` (margen) | Precisión en variables/umbrales | Media | ✅ |
| `RuleModal.tsx`, `ZoneGroupModal.tsx` | Validación de formularios | Media | ✅ |
| `settlementsDataSource.ts` | Número `LIQ-` y estados | Media | ✅ (numeración atómica: 🔧) |
| Hooks `useActiveCountry/useAuth/useOperationalContext` | Promesas sin capturar | Media | ✅ |
| `data/datasource.ts` | `Row = Record<string, any>` (≈80 usos) | Baja | 🟡 (ver pendientes) |
| Toda la carpeta | i18n: textos en español fijo | Baja | 🟡 Fase 3 |
| `RuleModal`, `RuleTester`, `LiquidarViajeModal`, datasources, `types.ts`, `evaluator.ts` … | Violación de límites de líneas / sin capa controller | Media | ⏳ Fase 2 |
| Modales sin `role="dialog"`, Esc, foco | Accesibilidad / sin `Modal` base | Media | ⏳ Fase 2 |
| `organization_id` ignorado por los datasources | Aislamiento solo en backend | Media | 🔧 |
