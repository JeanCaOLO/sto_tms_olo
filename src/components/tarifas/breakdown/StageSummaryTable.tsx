import { formatMoney } from '../../../lib/tarifas/format';
import type { Explanation } from '../../../lib/tarifas/explain';
import type { Money } from '../../../lib/tarifas/types';

interface Props {
  explicacion: Explanation;
  moneda: string;
  /** Total que calculó el motor, solo si difiere del mostrado (exclusiones manuales). */
  motorTotal: Money | null;
}

/** Un renglón por etapa y el total a liquidar. */
export function StageSummaryTable({ explicacion, moneda, motorTotal }: Props) {
  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <tbody className="divide-y divide-slate-100">
          {explicacion.stages.map((stage) => (
            <tr key={stage.stage}>
              <td className="px-4 py-2 text-slate-600">{stage.label}</td>
              <td className="px-4 py-2 text-right font-medium text-slate-800">
                {formatMoney(stage.subtotal, moneda)}
              </td>
            </tr>
          ))}
          {explicacion.stages.length === 0 && (
            <tr>
              <td className="px-4 py-4 text-center text-slate-400" colSpan={2}>
                Ninguna regla aplica a este viaje.
              </td>
            </tr>
          )}
        </tbody>
        <tfoot className="bg-slate-50 border-t-2 border-teal-200">
          <tr>
            <td className="px-4 py-2.5 font-semibold text-slate-900">Total a liquidar</td>
            <td className="px-4 py-2.5 text-right">
              <span className="text-lg font-bold text-teal-700">
                {formatMoney(explicacion.total, moneda)}
              </span>
              {motorTotal !== null && (
                <span className="block text-[11px] font-normal text-amber-700">
                  el motor calculó {formatMoney(motorTotal, moneda)}
                </span>
              )}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
