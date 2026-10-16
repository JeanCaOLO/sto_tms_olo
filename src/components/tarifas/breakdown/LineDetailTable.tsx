import { LineOrigin } from './LineOrigin';
import { formatMoney } from '../../../lib/tarifas/format';
import type { ExplainedLine, Explanation } from '../../../lib/tarifas/explain';

interface Props {
  explicacion: Explanation;
  moneda: string;
  countryOverridden: Set<string>;
  onToggleLine?: (seq: number) => void;
  hrefFor?: (origin: ExplainedLine['origen']) => string | null;
}

function LineExplanation({ line }: { line: ExplainedLine }) {
  return (
    <>
      <div>{line.como}</div>
      {line.fuente && (
        <div className="text-[11px] text-teal-600 mt-0.5">
          <i className="ri-table-line mr-0.5"></i>{line.fuente}
        </div>
      )}
      {line.override && (
        <div className="text-[11px] text-amber-700 mt-0.5">
          <i className="ri-edit-line mr-0.5"></i>
          corregido a mano: {line.override.reason}
        </div>
      )}
    </>
  );
}

/** Regla por regla: por qué aplicó, cómo se calculó, cuánto y el acumulado. */
export function LineDetailTable({ explicacion, moneda, countryOverridden, onToggleLine, hrefFor }: Props) {
  return (
    <div className="overflow-x-auto border border-slate-200 rounded-lg">
      <table className="w-full text-xs">
        <thead className="bg-slate-50">
          <tr className="text-left text-slate-500 uppercase">
            {onToggleLine && <th className="px-3 py-2 w-8"></th>}
            <th className="px-3 py-2 font-medium">Etapa</th>
            <th className="px-3 py-2 font-medium">Regla</th>
            <th className="px-3 py-2 font-medium">Por qué aplicó</th>
            <th className="px-3 py-2 font-medium">Cómo se calculó</th>
            <th className="px-3 py-2 font-medium text-right">Monto</th>
            <th className="px-3 py-2 font-medium text-right">Acumulado</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {explicacion.stages.flatMap((stage) => stage.lines).map((line) => (
            <tr key={line.seq} className={line.excluida ? 'bg-slate-50/80 text-slate-400' : ''}>
              {onToggleLine && (
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={!line.excluida}
                    onChange={() => onToggleLine(line.seq)}
                    className="rounded border-slate-300 text-teal-600 focus:ring-teal-500 cursor-pointer"
                    title={line.excluida ? 'Incluir en el total' : 'Excluir del total'}
                  />
                </td>
              )}
              <td className="px-3 py-2 text-slate-500">{line.stageLabel}</td>
              <td className="px-3 py-2">
                <div className={line.excluida ? 'line-through' : 'text-slate-800'}>{line.label}</div>
                <div className="text-[11px] text-slate-400 font-mono">{line.ruleCode}</div>
                <LineOrigin line={line} replacesCountry={countryOverridden.has(line.ruleCode)} hrefFor={hrefFor} />
              </td>
              <td className="px-3 py-2 text-slate-600 max-w-[16rem]">
                {line.porQue ?? <span className="text-slate-300">—</span>}
              </td>
              <td className="px-3 py-2 text-slate-600">
                <LineExplanation line={line} />
              </td>
              <td className={`px-3 py-2 text-right font-medium ${line.excluida ? 'line-through' : 'text-slate-900'}`}>
                {formatMoney(line.monto, moneda)}
              </td>
              <td className="px-3 py-2 text-right text-slate-500">
                {formatMoney(line.acumulado, moneda)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
