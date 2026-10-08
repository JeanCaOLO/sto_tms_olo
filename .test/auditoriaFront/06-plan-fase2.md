# Plan Fase 2 — Arquitectura (Page → useController → Api) y límites de tamaño

Principio: **refactor que preserva comportamiento**. La red de seguridad es la suite (≈770 pruebas) + `type-check`.
Sin cambios en backend. Los módulos de `src/lib/tarifas` que se parten dejan el archivo original como
barril de re-exportación para no romper imports ni tests.

Límites (`standards/code-quality.md`): página ≤200, componente ≤150, hook ≤80, servicio ≤150, módulo ≤200,
función ≤30 líneas, 1 símbolo por archivo. Patrón de referencia: `src/pages/oms/**/use*Controller.ts` + `src/pages/oms/api/omsApi.ts`.

## Paquetes de trabajo (archivos disjuntos entre agentes)
| Paquete | Alcance |
|---|---|
| A. Liquidaciones | `pages/liquidaciones/**`: `api/liquidacionesApi.ts`, `useLiquidacionesController`, `useLiquidarViajeController`, partición de `page.tsx`, `LiquidarViajeModal`, `TripOrdersPanel` |
| B. Reglas-tarifa (página) | `pages/reglas-tarifa/page.tsx` → `api/reglasTarifaApi.ts` + `useReglasTarifaController` + pestañas; `ResumenTab`, `CostosTab`, `PlantillasTab`, `BitacoraTab` |
| C. Reglas (modales grandes) | `RuleModal` (1151), `RuleTester` (712) → hooks de formulario + secciones |
| D. Tarifarios | `TarifariosTab`, `ImportRateTableModal`, `RateTableModal`, `ZoneGroupModal` |
| E. Compañías + paneles | `pages/companias/**` (`CostStructureModal`, `ImportSheetWizard`, `VariablesModal`, `CompaniasView`), `components/tarifas/CalcBreakdownPanel` |
| F. Datasources | `rateTablesDataSource`, `settlementsDataSource`, `costStructureDataSource`, `data/json-datasource`, `localRulesDataSource`, `tripsDataSource` (barril + módulos) |
| G. Motor y módulos | `evaluator`, `resolver`, `cost`, `rule-builder`, `costTemplate`, `costSheetParser`, `catalogLoader`, `types.ts`, `explain` |
| H. Modal base | `components/base/Modal.tsx` accesible (role=dialog, aria-modal, Esc, clic en fondo, foco) + adopción en los modales de A–E |

## Orden y coordinación
1. H primero (pequeño) para que A–E lo usen.
2. A, B, C, D, E, F, G en paralelo, cada uno sobre sus archivos; los imports entre paquetes pasan por los barriles.
3. Verificación integral al final: `type-check`, vitest completo, eslint del alcance.

## Criterio de cierre
- Cada archivo del alcance dentro de su límite o la desviación documentada en `07-registro-cambios-fase2.md`.
- Suite verde, `type-check` limpio, 0 errores de lint nuevos.
- Funciones >30 líneas: se parten las evidentes; las de lógica crítica del motor se parten solo con cobertura probada.
