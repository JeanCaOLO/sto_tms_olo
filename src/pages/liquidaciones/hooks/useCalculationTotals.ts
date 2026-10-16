// State for settlement totals and effective result calculation.

import { useMemo } from 'react';
import { computeSettlementTotals, resultWithTotal } from '../../../lib/tarifas/settlementTotals';
import type { TripCalculation } from '../../../lib/tarifas/tripSettlement';

export function useCalculationTotals(
  calculation: TripCalculation | null,
  excludedSeqs: Set<number>,
) {
  const totals = useMemo(
    () => (calculation
      ? computeSettlementTotals(calculation.result.trace, excludedSeqs, calculation.input.country)
      : null),
    [calculation, excludedSeqs],
  );

  const effectiveResult = useMemo(
    () => (calculation && totals
      ? resultWithTotal(calculation.result, totals, calculation.input)
      : null),
    [calculation, totals],
  );

  return { totals, effectiveResult };
}
