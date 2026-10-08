// ¿CUÁNTO suma cada regla? Switch exhaustivo sobre los 10 operadores de Expr — sin eval, sin
// fórmulas como texto. También aloja runChargePipeline, que recorre las etapas en el orden fijo
// de STAGE_ORDER usando la lista de reglas ya resueltas por resolver.ts.
// Puerto literal de vista-tarifas-fase1/src/kernel/evaluator.ts.

// Barril: re-exporta todas las definiciones del evaluador.
// Los nombres públicos son idénticos — los imports externos siguen funcionando sin cambios.

export { evaluatePred, RuleShapeError } from './evaluator/predicates';

export { sortTiers, progressiveAmount, evaluateExpr, type EvalContext } from './evaluator/expressions';

export { lookupRateTable, type RateTableLookup } from './evaluator/lookup';

export { detectRuleCycles } from './evaluator/cycles';

export { runChargePipeline, type ChargeResult } from './evaluator/pipeline';
