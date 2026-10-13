// Right sidebar with breakdown and totals for settlement calculation.

import CalcBreakdownPanel, { AllocationBlock } from '../../../components/tarifas/CalcBreakdownPanel';
import { formatMoney } from '../../../lib/tarifas/format';
import { ruleHref } from '../parts/emission';
import type { TripCalculation } from '../../../lib/tarifas/tripSettlement';
import type { CalcIssue, CalcResult } from '../../../lib/tarifas/types';
import type { SettlementTotals } from '../../../lib/tarifas/settlementTotals';

interface Props {
  simple: boolean;
  pending: boolean;
  blocking: CalcIssue[];
  calculation: TripCalculation | null;
  totals: SettlementTotals | null;
  effectiveResult: CalcResult | null;
  excludedSeqs: Set<number>;
  onToggleExcluded: (seq: number) => void;
  currency: string;
}

export function CalculationSidebar({
  simple,
  pending,
  blocking,
  calculation,
  totals,
  effectiveResult,
  excludedSeqs,
  onToggleExcluded,
  currency,
}: Props) {
  return (
    <div className={simple ? '' : 'lg:sticky lg:top-20'}>
      <div className="space-y-3">
        {simple ? (
          pending && <p className="text-xs text-slate-400"><i className="ri-loader-4-line animate-spin mr-1" />Recalculando…</p>
        ) : (
          <h3 className="text-sm font-semibold text-slate-700">
            ¿Por qué este total?
            {pending && <i className="ri-loader-4-line animate-spin ml-2 text-slate-400" />}
          </h3>
        )}

        {blocking.length > 0 && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-4 py-3">
            <p className="font-medium mb-1">No se puede emitir:</p>
            <ul className="space-y-0.5">
              {blocking.map((p, i) => (
                <li key={i}>• {p.message}</li>
              ))}
            </ul>
          </div>
        )}

        {calculation && totals && simple && (
          <div className="rounded-lg bg-teal-50 border border-teal-200 px-4 py-3">
            <div className="text-xs text-teal-700">Total a pagar</div>
            <div className="text-2xl font-bold text-teal-800">{formatMoney(totals.total, currency)}</div>
          </div>
        )}

        {calculation && effectiveResult && <AllocationBlock allocation={effectiveResult.allocation} />}

        {calculation && totals && !simple && (
          <>
            <CalcBreakdownPanel
              result={effectiveResult ?? calculation.result}
              ctx={{
                rules: calculation.input.rules,
                customLabels: Object.fromEntries(
                  (calculation.input.partyVariables ?? []).map((v) => [v.key, v.label]),
                ),
              }}
              excludedSeqs={excludedSeqs}
              hrefFor={ruleHref}
              total={totals.total}
              onToggleLine={onToggleExcluded}
            />
            {totals.excludedCount > 0 && (
              <p className="text-xs text-amber-700">
                {totals.excludedCount} línea{totals.excludedCount === 1 ? '' : 's'} excluida
                {totals.excludedCount === 1 ? '' : 's'}: {formatMoney(totals.excludedAmount, currency)} menos.
              </p>
            )}
            {calculation.warnings.length > 0 && (
              <ul className="text-xs text-amber-700 space-y-0.5">
                {calculation.warnings.map((w, i) => (
                  <li key={i}>• {w}</li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}
