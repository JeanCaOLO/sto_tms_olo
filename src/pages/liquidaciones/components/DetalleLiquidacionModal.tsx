// El desglose de una liquidación ya emitida.
//
// Es lo que antes era imposible: la liquidación se guardaba en una tabla sin columnas para la traza,
// los descartes ni los avisos, así que quedaba un total y nada más. Ante un reclamo no había forma
// de decir de dónde salía ese número.
//
// Se lee del snapshot guardado, **no se recalcula**: una liquidación emitida tiene que poder
// releerse tal cual se emitió aunque después la regla se haya editado o dado de baja.

import Button from '../../../components/base/Button';
import Badge from '../../../components/base/Badge';
import CalcBreakdownPanel from '../../../components/tarifas/CalcBreakdownPanel';
import { formatMoney } from '../../../lib/tarifas/format';
import { describeReturn } from '../../../lib/tarifas/returnsNote';
import type { CalcResult, SettlementRecord } from '../../../lib/tarifas/types';

interface Props {
  settlement: SettlementRecord | null;
  onClose: () => void;
}

export default function DetalleLiquidacionModal({ settlement, onClose }: Props) {
  if (!settlement) return null;

  // Se rearma el resultado desde lo guardado. Los campos que el panel necesita están todos
  // persistidos justamente para esto.
  const result: CalcResult = {
    trace: settlement.trace,
    discarded: settlement.discarded,
    stageSubtotals: settlement.stageSubtotals,
    totalLiquidado: settlement.totalAmount,
    currency: settlement.currency,
    cost: {
      total: settlement.costTotal ?? '0',
      breakdown: [],
      modelId: settlement.costModelId ?? '—',
      currency: settlement.currency,
    },
    margin: {
      amount: settlement.marginAmount ?? '0',
      pct: settlement.marginPct ?? '0',
      status: settlement.marginStatus ?? 'OK',
      action: 'NONE',
      currency: settlement.currency,
    },
    warnings: settlement.warnings,
    blockingIssues: [],
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 bg-white flex items-center justify-between px-6 py-4 border-b border-slate-200 z-10">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">
              {settlement.number}
              {settlement.tripNumber && (
                <span className="ml-2 text-sm font-normal text-slate-500">
                  viaje {settlement.tripNumber}
                </span>
              )}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Emitida el {settlement.settlementDate} · así quedó congelada, sin recalcular.
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 cursor-pointer" aria-label="Cerrar">
            <i className="ri-close-line text-xl"></i>
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          <div className="flex items-center gap-3">
            <Badge variant="default">{settlement.status}</Badge>
            <span className="text-2xl font-bold text-teal-700">
              {formatMoney(settlement.totalAmount, settlement.currency)}
            </span>
            {settlement.excludedSeqs.length > 0 && (
              <span className="text-xs text-amber-700">
                {settlement.excludedSeqs.length} línea
                {settlement.excludedSeqs.length === 1 ? '' : 's'} excluida
                {settlement.excludedSeqs.length === 1 ? '' : 's'} del total
              </span>
            )}
          </div>

          {settlement.marginReason && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-lg px-4 py-2.5">
              <strong>Motivo del margen:</strong> {settlement.marginReason}
            </div>
          )}

          {settlement.returns.length > 0 && (
            <div className="border border-slate-200 rounded-lg p-4">
              <h4 className="text-xs font-semibold text-slate-600 uppercase mb-2">
                Devoluciones informadas
              </h4>
              <ul className="text-xs text-slate-600 space-y-0.5">
                {settlement.returns.map((d, i) => <li key={i}>• {describeReturn(d)}</li>)}
              </ul>
              <p className="text-[11px] text-slate-400 mt-2">
                Informativo: no afectaron el pago.
              </p>
            </div>
          )}

          <CalcBreakdownPanel
            result={result}
            ctx={{ rules: settlement.adhocRules }}
            excludedSeqs={settlement.excludedSeqs}
            total={settlement.totalAmount}
          />

          {settlement.notes && (
            <div className="border border-slate-200 rounded-lg p-4">
              <h4 className="text-xs font-semibold text-slate-600 uppercase mb-1">Notas</h4>
              <p className="text-xs text-slate-600 whitespace-pre-line">{settlement.notes}</p>
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-white flex justify-end px-6 py-4 border-t border-slate-200">
          <Button variant="secondary" onClick={onClose}>Cerrar</Button>
        </div>
      </div>
    </div>
  );
}
