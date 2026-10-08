import { COST_DRIVER_LABELS } from '../../../../lib/tarifas/cost';
import type { ParseResult } from '../../../../lib/tarifas/costSheetParser';

/** Las filas que se van a importar, tal como quedarían. */
export function PreviewRowsTable({ rows }: { rows: ParseResult['rows'] }) {
  return (
    <div className="overflow-x-auto border border-slate-200 rounded-lg max-h-64">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-slate-50">
          <tr className="text-left text-xs font-medium text-slate-500 uppercase">
            <th className="px-3 py-2">Fila</th>
            <th className="px-3 py-2">Concepto</th>
            <th className="px-3 py-2 text-right">Importe</th>
            <th className="px-3 py-2">Cómo se cobra</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr key={r.code}>
              <td className="px-3 py-1.5 text-xs text-slate-400">{r.sourceRow}</td>
              <td className="px-3 py-1.5 text-slate-800">{r.label}</td>
              <td className="px-3 py-1.5 text-right font-mono text-slate-700">{r.amount}</td>
              <td className="px-3 py-1.5 text-xs text-slate-500">{COST_DRIVER_LABELS[r.driver]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
