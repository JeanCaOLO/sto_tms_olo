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

## Segunda tanda (decisiones confirmadas por cuestionario, 2026-10-15)
- **Fijo mensual = prorrateo por día** en ambos lados: `structureCostPerKm` ahora expresa el mensual como `monto × días_viaje ÷ días_operativos ÷ km` (antes `monto×12÷kmAnual`). Test: costo/km × km == costo del viaje (`f1Dinero.test.ts`). Efecto: la base por km de un tercero con estructura propia cambia de monto cuando hay fijos mensuales; ya no depende de `km_anual` para los fijos.
- **Modelo de 3 valores** como módulo puro `cost/perKm.ts` (`computePerKm`: operativo, facturable = operativo ÷ proporción de km con carga, venta = facturable ÷ (1 − margen); valida 0 ≤ margen < 1). NO conectado a liquidar: falta que negocio defina qué entra en "facturable" y el origen del margen.
- **Bitácora atómica**: emitir, re-liquidar y cambiar de estado escriben la fila de `auditLog` en la MISMA transacción (`audit.ts: auditRow`, `liquidador/auditLog.ts: eventoToRow`). Si falla la bitácora se revierte el cambio (antes se tragaba el error). El backend (`app.py: _stamp_actor`) sobrescribe `user_name`/`role` de `tarifas_audit_log` con el correo del token y el rol del que llama (insert, tx insert e insert_many).
- **Plantilla de costos**: alias de claves de parámetros (`km_anual` / `km anual` / `km por año` / `precio del combustible`…); el resumen de la plantilla deriva el costo/km de componentes con `componentCostPerKm` en vez de leer el `costPerKm` persistido (la columna se conserva solo para mostrar).

## Tercera tanda — menores (decisiones por cuestionario)
- `looksNumeric` (alias) eliminado; se usa `looksLikeNumber`.
- Rangos de tarifario (`rateRange.ts`): solo `..` abre un extremo; el guion (`-`, `–`, `—`) exige dos números, así `-5` es el valor negativo exacto y no "hasta 5". Coma con exactamente 3 dígitos = miles (`1,000..2,000` = 1000..2000); con 1-2 dígitos, decimal (`1,5..2,5`).
- `isAmbiguousThousands` (`cost-sheet-parser/utils.ts`): un punto + 3 dígitos con formato `auto` ("1.234") se sigue leyendo como decimal (un precio de 0.755 es válido) pero `parseRateTableSheet` devuelve `warnings` y el modal de importación de tarifarios los muestra para elegir formato es/en. `parseRateRows` (sin UI) no lo usa.

## Pendiente
- Conectar `computePerKm` a la base de cobro (decisión de negocio abierta).
- F6 (simplificación de etapas): solo planteamiento en `.test/cambios_motor/simplificacion-etapas.md`.

## Verificación
`npx vitest run` 114 archivos / 1215 tests OK; `tsc --noEmit` limpio; `pytest backend/tests` 266 OK (10 errores preexistentes por falta de `boto3`, `botocore` en el entorno).
