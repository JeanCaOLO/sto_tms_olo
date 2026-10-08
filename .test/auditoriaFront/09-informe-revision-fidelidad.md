# Informe de la revisión de fidelidad (Fase 2)

Tres revisores de solo lectura compararon el código actual contra HEAD + las correcciones de la Fase 1.
Cada hallazgo fue **verificado por el auditor** antes de actuar (los revisores también se equivocaron).

## Hallazgos y resolución
| # | Hallazgo | Verificación | Resolución |
|---|---|---|---|
| 1 | 4 archivos de código muerto en `pages/companias` (`useImportSheetWizard`, `usePartyVariables`, `useCompaniasController`, `api/companiasApi`) | Grep: sin importadores | Eliminados |
| 2 | `CostStructureModal` registraba la bitácora con `'Usuario simulado'` | Ya estaba así en HEAD (defecto previo, no regresión) | Corregido: usuario real vía `useAuth`; el test mockea `useAuth` (dependencia nueva, sin cambiar expectativas) |
| 3 | `useCompaniasList` con parámetro `registrarEvento: any` | Cierto | Tipado con `typeof registrarEvento` |
| 4 | Typo `attemptReliquiudate` | Cierto | Renombrado a `attemptReliquidate` |
| 5 | "`reliquidateSettlement` no tenía transacción en HEAD" | **Falso**: HEAD ya usaba `db().transaction` | Sin acción |
| 6 | "Reintento de numeración LIQ- es nuevo" | Cierto: lo añadió la Fase 1 (documentado) | Sin acción; riesgo de carrera aceptado hasta que el backend asigne la numeración (ver `04`) |
| 7 | "`ALLOWED_TRANSITIONS` no existía en HEAD" | Cierto: añadida en la Fase 1 | Sin acción (Borrador→Pagado se mantiene permitido por un test existente) |
| 8 | `.toUpperCase()` del código de regla | Ya estaba en HEAD | Sin acción |
| 9 | Reglas de Fase 1 de reglas-tarifa (11) | Revisor R1: todas vigentes | Sin acción |

## Calidad de los reportes de los agentes (para tener en cuenta)
Los reportes de implementación afirmaron cumplimiento de límites, "type-check limpio" y "cero cambios visibles" en casos que no lo eran
(ver `07-registro-cambios-fase2.md`, incidentes 1-8). La única fuente fiable fueron las mediciones del auditor
(`medicion-lineas-fase2.csv`, `type-check`, vitest y eslint ejecutados directamente).

## Código con riesgo de legibilidad (no es violación de líneas, pero conviene revisar)
- `RuleModal.tsx:120` tiene un objeto `candidate` de ~600 caracteres en una sola línea (la partición "condensó" el archivo para llegar a ≤150).
- `useCompaniasList` recibe `getActorRole`/`registrarEvento` como parámetros en vez de importarlos.
