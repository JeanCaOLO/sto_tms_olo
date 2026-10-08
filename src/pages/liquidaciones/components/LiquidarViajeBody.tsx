// Cuerpo del modal de liquidar: el cálculo a la izquierda y, en la vista extendida, el lateral.

import type { CalcIssue } from '../../../lib/tarifas/types';
import type { LiquidarViajeController } from '../hooks/useLiquidarViajeController';
import { CalculationContent } from './CalculationContent';
import { CalculationSidebar } from './CalculationSidebar';

const SHOW_ORDERS_REASON = 'Cada guía lleva un pedido. Anular saca el pedido del reparto; '
  + '"Liquidar después" lo deja con su proforma pendiente. Ninguna de las dos cambia lo que se le paga al transportista.';

interface Props {
  ctrl: LiquidarViajeController;
  simple: boolean;
  blocking: CalcIssue[];
  currency: string;
}

export function LiquidarViajeBody({ ctrl, simple, blocking, currency }: Props) {
  const { calculation, excludedSeqs, setExcludedSeqs } = ctrl;
  if (!calculation) return null;

  const toggleExcluded = (seq: number) => {
    const next = new Set(excludedSeqs);
    if (next.has(seq)) next.delete(seq);
    else next.add(seq);
    setExcludedSeqs(next);
  };

  return (
    <div className={`grid grid-cols-1 ${simple ? '' : 'lg:grid-cols-5'} gap-6`}>
      <div className={simple ? '' : 'lg:col-span-3'}>
        <CalculationContent
          calculation={calculation}
          simple={simple}
          customRaw={ctrl.customRaw}
          onSetRaw={(k, v) => ctrl.setCustomRaw((prev) => ({ ...prev, [k]: v }))}
          returns={ctrl.returns}
          onSetReturns={ctrl.setReturns}
          notes={ctrl.notes}
          onSetNotes={ctrl.setNotes}
          status={ctrl.status}
          onSetStatus={ctrl.setStatus}
          excludedSeqs={excludedSeqs}
          onToggleExcluded={toggleExcluded}
          totals={ctrl.totals}
          effectiveResult={ctrl.effectiveResult}
          onOrdersChanged={() => {
            setExcludedSeqs(new Set());
            void ctrl.runCalc({ customVars: undefined });
          }}
          showOrdersReason={SHOW_ORDERS_REASON}
        />
      </div>

      <div className={simple ? '' : 'lg:col-span-2'}>
        <CalculationSidebar
          simple={simple}
          pending={ctrl.pending}
          blocking={blocking}
          calculation={calculation}
          totals={ctrl.totals}
          effectiveResult={ctrl.effectiveResult}
          excludedSeqs={excludedSeqs}
          onToggleExcluded={toggleExcluded}
          currency={currency}
        />
      </div>
    </div>
  );
}
