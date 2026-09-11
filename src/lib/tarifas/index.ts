// calculate(): el único punto de entrada del kernel. Orquesta resolver -> evaluator -> cost ->
// margin y devuelve un CalcResult completo: cuánto se le debe LIQUIDAR (pagar) al transportista
// por el viaje, cuánto cuesta operarlo, y qué tan bien parado queda ese pago frente a ese costo.
// Es una función pura: recibe todo lo que necesita como parámetro (CalculateInput), no lee nada
// del entorno.

import { computeCost } from './cost';
import { runChargePipeline } from './evaluator';
import { computeMargin } from './margin';
import { deriveContext, resolveRules } from './resolver';
import type { CalculateInput, CalcResult } from './types';
import { toDecimal } from './money';

export function calculate(input: CalculateInput): CalcResult {
  const derived = deriveContext(input);
  const { applied, discarded } = resolveRules(input, derived);
  const charge = runChargePipeline(applied, derived.vars, derived.originZoneId, derived.destZoneId, input);
  const cost = computeCost(input, derived.overnightNights);
  const margin = computeMargin(
    toDecimal(charge.totalLiquidado),
    toDecimal(cost.total),
    input.marginPolicy,
    input.country,
  );

  return {
    trace: charge.trace,
    discarded,
    stageSubtotals: charge.stageSubtotals,
    totalLiquidado: charge.totalLiquidado,
    cost,
    margin,
    fxUsed: charge.fxUsed,
    warnings: charge.warnings,
  };
}

export * from './types';
export { evaluateExpr, evaluatePred } from './evaluator';
export { computeOvernightNights, computeWeekday, deriveContext, resolveRules } from './resolver';
export { computeCost } from './cost';
export { computeMargin } from './margin';
export * from './money';
