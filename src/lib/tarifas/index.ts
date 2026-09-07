// calculate(): el único punto de entrada del kernel. Orquesta resolver -> evaluator y devuelve un
// CalcResult completo: cuánto se le debe LIQUIDAR (pagar) al transportista por el viaje. Es una
// función pura: recibe todo lo que necesita como parámetro (CalculateInput), no lee nada del
// entorno.

import { runChargePipeline } from './evaluator';
import { deriveContext, resolveRules } from './resolver';
import type { CalculateInput, CalcResult } from './types';

export function calculate(input: CalculateInput): CalcResult {
  const derived = deriveContext(input);
  const { applied, discarded } = resolveRules(input, derived);
  const charge = runChargePipeline(applied, derived.vars, derived.originZoneId, derived.destZoneId, input);

  return {
    trace: charge.trace,
    discarded,
    stageSubtotals: charge.stageSubtotals,
    totalLiquidado: charge.totalLiquidado,
    fxUsed: charge.fxUsed,
    warnings: charge.warnings,
  };
}

export * from './types';
export { evaluateExpr, evaluatePred } from './evaluator';
export { computeOvernightNights, computeWeekday, deriveContext, resolveRules } from './resolver';
export * from './money';
