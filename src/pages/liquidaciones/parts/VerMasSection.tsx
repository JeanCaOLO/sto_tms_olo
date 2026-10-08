// Vista simple: el detalle (pedidos, desglose y devoluciones) plegado detrás de «Ver más».

import { useState } from 'react';
import CalcBreakdownPanel from '../../../components/tarifas/CalcBreakdownPanel';
import TripOrdersPanel from '../components/TripOrdersPanel';
import { ReturnsSection } from './ReturnsSection';
import type { TripCalculation } from '../../../lib/tarifas/tripSettlement';
import type { CalcResult, SettlementReturn } from '../../../lib/tarifas/types';
import type { SettlementTotals } from '../../../lib/tarifas/settlementTotals';

interface Props {
  calculation: TripCalculation;
  currency: string;
  returns: SettlementReturn[];
  onSetReturns: (rets: SettlementReturn[]) => void;
  excludedSeqs: Set<number>;
  totals: SettlementTotals | null;
  effectiveResult: CalcResult | null;
}

export function VerMasSection({
  calculation, currency, returns, onSetReturns, excludedSeqs, totals, effectiveResult,
}: Props) {
  const [verMas, setVerMas] = useState(false);

  return (
    <div className="border-t border-slate-200 pt-3">
      <button
        type="button"
        onClick={() => setVerMas((v) => !v)}
        aria-expanded={verMas}
        className="text-sm font-medium text-teal-700 hover:underline cursor-pointer"
      >
        <i className={`${verMas ? 'ri-arrow-up-s-line' : 'ri-arrow-down-s-line'} mr-1`} />
        {verMas ? 'Ver menos' : 'Ver más: pedidos, devoluciones y desglose'}
      </button>
      {verMas && (
        <div className="mt-3 max-h-[42vh] overflow-y-auto border border-slate-200 rounded-lg p-3 space-y-4 bg-slate-50/50">
          <section>
            <h3 className="text-sm font-semibold text-slate-700 mb-2">Pedidos del viaje</h3>
            <TripOrdersPanel
              trip={calculation.trip}
              currency={currency}
              intro="Anular saca el pedido del reparto; Liquidar después lo deja con su proforma pendiente."
            />
          </section>
          <section>
            <h3 className="text-sm font-semibold text-slate-700 mb-2">Por qué este total</h3>
            {effectiveResult && totals && (
              <CalcBreakdownPanel
                result={effectiveResult}
                ctx={{
                  rules: calculation.input.rules,
                  customLabels: Object.fromEntries(
                    (calculation.input.partyVariables ?? []).map((v) => [v.key, v.label]),
                  ),
                }}
                excludedSeqs={excludedSeqs}
                total={totals.total}
                fixedLevel="resumen"
              />
            )}
          </section>
          <ReturnsSection returns={returns} onSetReturns={onSetReturns} simple />
        </div>
      )}
    </div>
  );
}
