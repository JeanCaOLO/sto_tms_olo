# Revisión del motor del tarifador — fases F1–F5 aplicadas

Fecha: 2026-10-15. Alcance: `src/lib/tarifas/` y `backend/tarifas/`. Sin despliegue, sin push, sin tocar devoluciones ni otros módulos.

## Aplicado

**F1 — dinero (tests: `__tests__/f1Dinero.test.ts`)**
- `settlementTotals.ts`: `computeSettlementTotals` acepta el resultado del motor y, sin exclusiones, devuelve su total/subtotales (el motor suma exacto y redondea una vez; las líneas ya vienen redondeadas, sumarlas diferia por centavos). `differsFromEngine` ya no da falso positivo al destildar una línea de importe cero. `useCalculationTotals` pasa el resultado.
- `cost/structure.ts`: `cost.total` = suma de las líneas redondeadas (coincide con la base que siembra el pipeline, margen incluido).
- `money.ts`: `tryDecimal`. `quantityOf` (`expressions.ts`) y `unitsForDriver` (`cost/driver.ts`) avisan y valen 0 con datos no numéricos (antes `toDecimal` lanzaba y abortaba la liquidación; el `isNaN` era inalcanzable). `PER_BLOCK` con bloque ≤ 0 pasa a `RuleShapeError` → regla ilegible + bloqueo (antes `Error` genérico).
- Avisos de `km = 0` y de importes mensuales prorrateados sin días operativos.

**F2 — resolver/AST (tests: `f2Resolver.test.ts`)**
- Rangos de tarifario: valor vacío/no numérico ya no cae en `0..100`.
- `ExprSchema`: rechaza dos escalones abiertos, límites repetidos y `CLAMP` con min > max.
- Grupo MAX: candidatos se evalúan "en seco" (sin avisos ni `tableMatch` ajenos) y `BASE_NO_DISPONIBLE` no se duplica.
- Una sola definición de orden de reglas (`compareRules`, usada también por `baseOverride.ts`) y de `looseEq` (`predicates.ts`, usada por `lookup.ts`).

**F3 — costos**
- `cost/shared.ts`: `pickStructure`, `hasRows`, comparación de tipo de camión sin acentos/mayúsculas (`rowAppliesToTruck`, `fuelEfficiencyFor`) usados por `structure.ts` y `baseMethods.ts`.
- `parseAmount`: varios puntos sin coma = miles ("1.234.567").
- `costStructure/rowMapper.ts`: `rowValues` (antes ×3) y `rowPatch`; `updateRow` ahora actualiza frecuencia, unidades y costo por km.

**F4 — backend / datos (tests: `backend/tests/test_tarifas.py`)**
- `tarifas_sql.build_update`: una liquidación solo admite `status`, `margin_reason`, `superseded_by`, `updated_at` (otra columna → 403); la transición de estado se valida DENTRO del UPDATE (`status = ANY(origenes)`, y sin reactivar reemplazadas) → sin carrera entre usuarios. Sin fila afectada → 409. Espejo de `statusTransitions.ts`: si cambia uno, cambiar el otro.
- `_require_country`: un rol acotado a países no puede crear ni volver global (country_id nulo) una fila de tabla con país nullable.
- Lecturas recortadas por `MAX_ROWS` (sin `limit` explícito): header `X-Tarifas-Truncated` + línea de log. (El header no se expone por CORS: de momento solo sirve en logs.)
- `nextNumber`: pagina por cursor (antes una lectura truncada a 5000 daba número repetido y bloqueaba la emisión).
- F5: borrados loaders sueltos sin llamadores (`loadRulesAndPolicy`, `loadPartyData` y auxiliares) y `parseTemplate`.

## Hallazgos descartados / matizados
- **A3 (override de compañía anula regla de país)**: NO es defecto. Una regla de compañía inactiva con el mismo código es la forma de apagar la de país para esa compañía (`scope.test.ts`).
- `parseAmount` borra letras: es deliberado (`'1 UND' → '1'` en `costSheetParser.test.ts`); no se cambió. "1.234" (un punto) y "1,500" siguen ambiguos por diseño; usar formato `es`/`en` explícito.
- Predicado `NEQ` con variable ausente da true: se dejó (semántica "ausente ≠ valor").
- `country_number_uq` sí existe en `sql/04` y `sql/26`; solo falta en `sql/19` (DDL generado, snapshot).
- `tms_handler` ya deja auditoría de actor por request en el servidor.

## Pendiente (requiere decisión)
- A8/A9: fijo mensual (prorrateo por día vs amortización por km) y modelo de 3 valores (operativo / facturable / venta = facturable ÷ (1 − margen)); depende del "ABIERTO" de `project.md` con Jean Carlo/Dylan.
- A6: bitácora atómica con la liquidación y actor tomado del JWT (toca `src/lib/liquidador/auditLog`, compartido).
- `costPerKm` persistido redundante; alias de claves de plantilla; `looksNumeric`; rangos "1,000..2,000" y "-5".
- F6 (simplificación de etapas): solo planteamiento en `.test/cambios_motor/simplificacion-etapas.md`.

## Verificación
`npx vitest run` 114 archivos / 1215 tests OK; `tsc --noEmit` limpio; `pytest backend/tests` 266 OK (10 errores preexistentes por falta de `boto3`, `botocore` en el entorno).
