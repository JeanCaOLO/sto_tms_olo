// Main content section for calculation, variables, orders.

import CalcBreakdownPanel, { AllocationBlock } from '../../../components/tarifas/CalcBreakdownPanel';
import { formatMoney } from '../../../lib/tarifas/format';
import TripOrdersPanel from './TripOrdersPanel';
import BaseMethodPanel from './BaseMethodPanel';
import { TripInfoSection } from '../parts/TripInfoSection';
import { VariablesSection } from '../parts/VariablesSection';
import { VerMasSection } from '../parts/VerMasSection';
import { ReturnsSection } from '../parts/ReturnsSection';
import { buildEmissionInput, ESTADOS, ruleHref } from '../parts/emission';
import type { TripCalculation } from '../../../lib/tarifas/tripSettlement';
import type { BaseMethodId, CalcResult, SettlementReturn, SettlementStatus } from '../../../lib/tarifas/types';
import type { SettlementTotals } from '../../../lib/tarifas/settlementTotals';

interface Props {
  calculation: TripCalculation;
  simple: boolean;
  customRaw: Record<string, string>;
  onSetRaw: (key: string, value: string) => void;
  returns: SettlementReturn[];
  onSetReturns: (rets: SettlementReturn[]) => void;
  notes: string;
  onSetNotes: (notes: string) => void;
  status: SettlementStatus;
  onSetStatus: (status: SettlementStatus) => void;
  excludedSeqs: Set<number>;
  onToggleExcluded: (seq: number) => void;
  totals: SettlementTotals | null;
  effectiveResult: CalcResult | null;
  /** Recalcula tras cambiar una marca y devuelve una promesa: el panel espera los pedidos nuevos. */
  onOrdersChanged: () => void | Promise<unknown>;
  showOrdersReason: string;
  /** Tipo de cobro elegido para la base. Null = la base por defecto. */
  baseMethod: BaseMethodId | null;
  onBaseChange: (method: BaseMethodId | null) => void;
  /** Se creó una regla: hay que recalcular leyendo el catálogo de nuevo. */
  onBaseRuleCreated: () => void;
  baseBusy: boolean;
}

export function CalculationContent({
  calculation,
  simple,
  customRaw,
  onSetRaw,
  returns,
  onSetReturns,
  notes,
  onSetNotes,
  status,
  onSetStatus,
  excludedSeqs,
  onToggleExcluded,
  totals,
  effectiveResult,
  onOrdersChanged,
  showOrdersReason,
  baseMethod,
  onBaseChange,
  onBaseRuleCreated,
  baseBusy,
}: Props) {
  const currency = calculation.result.currency ?? '';

  const handleSetRaw = (key: string, value: string) => {
    onSetRaw(key, value);
  };

  return (
    <div className="space-y-5">
      <TripInfoSection calculation={calculation} simple={simple} />
      <BaseMethodPanel
        calculation={calculation}
        value={baseMethod}
        onChange={onBaseChange}
        busy={baseBusy}
        extendida={!simple}
        onRuleCreated={onBaseRuleCreated}
      />
      <VariablesSection
        calculation={calculation}
        customRaw={customRaw}
        onSetRaw={handleSetRaw}
        simple={simple}
      />

      {!simple && (
        <section className="border-t border-slate-200 pt-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-2">3 · Pedidos del viaje</h3>
          <TripOrdersPanel
            trip={calculation.trip}
            currency={currency}
            editable
            orders={calculation.orders}
            onChanged={onOrdersChanged}
            intro={showOrdersReason}
          />
        </section>
      )}

      {simple && (
        <VerMasSection
          calculation={calculation}
          currency={currency}
          returns={returns}
          onSetReturns={onSetReturns}
          excludedSeqs={excludedSeqs}
          totals={totals}
          effectiveResult={effectiveResult}
        />
      )}

      {!simple && <ReturnsSection returns={returns} onSetReturns={onSetReturns} simple={false} />}

      <section className="border-t border-slate-200 pt-4 space-y-3">
        {!simple && (
          <>
            <h3 className="text-sm font-semibold text-slate-700">5 · Notas y estado</h3>
            <textarea
              value={notes}
              onChange={(e) => onSetNotes(e.target.value)}
              rows={2}
              placeholder="Observaciones del viaje"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </>
        )}
        {!simple && (
          <select
            value={status}
            onChange={(e) => onSetStatus(e.target.value as SettlementStatus)}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
          >
            {ESTADOS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        )}
      </section>
    </div>
  );
}
