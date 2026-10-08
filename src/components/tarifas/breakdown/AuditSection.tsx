import Badge from '../../base/Badge';
import { MARGIN_LABEL } from './breakdownLabels';
import { formatMoney, formatPct } from '../../../lib/tarifas/format';
import type { Explanation } from '../../../lib/tarifas/explain';
import type { CalcResult } from '../../../lib/tarifas/types';

function TripVariablesCard({ variables }: { variables: Explanation['variablesUsadas'] }) {
  return (
    <div className="border border-slate-200 rounded-lg p-4">
      <h4 className="text-xs font-semibold text-slate-600 uppercase mb-2">
        Datos del viaje que entraron en el cálculo
      </h4>
      {variables.length === 0 ? (
        <p className="text-xs text-slate-400">Ninguna regla usó datos del viaje.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {variables.map((v) => (
            <span key={v.key} className="px-2 py-1 text-xs bg-slate-100 rounded-full text-slate-700">
              {v.label}: <strong>{v.value}</strong>
            </span>
          ))}
        </div>
      )}
      <p className="text-[11px] text-slate-400 mt-2">
        Lo que no está acá no influyó en el total.
      </p>
    </div>
  );
}

function DiscardsCard({ discards }: { discards: Explanation['discards'] }) {
  return (
    <div className="border border-slate-200 rounded-lg p-4">
      <h4 className="text-xs font-semibold text-slate-600 uppercase mb-2">
        Reglas que no aplicaron
      </h4>
      {discards.length === 0 ? (
        <p className="text-xs text-slate-400">Todas las reglas del país aplicaron.</p>
      ) : (
        <div className="space-y-3">
          {discards.map((grupo) => (
            <div key={grupo.reason}>
              <Badge variant="default" size="sm">{grupo.reasonLabel}</Badge>
              <ul className="mt-1 space-y-0.5">
                {grupo.rules.map((r) => (
                  <li key={r.ruleCode} className="text-xs text-slate-600">
                    <span className="font-mono text-slate-400">{r.ruleCode}</span> — {r.detail}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MarginDetail({ margin, moneda }: { margin: CalcResult['margin']; moneda: string }) {
  return (
    <>
      <table className="w-full text-xs">
        <tbody className="divide-y divide-slate-100">
          <tr>
            <td className="py-1.5 text-slate-700">Valor de la mercancía</td>
            <td className="py-1.5 text-right font-medium text-slate-800">
              {formatMoney(margin.cargoValue, moneda)}
            </td>
          </tr>
          <tr>
            <td className="py-1.5 text-slate-700">Gastos operativos (total pagado)</td>
            <td className="py-1.5 text-right font-medium text-slate-800">
              {formatMoney(margin.expense, moneda)}
            </td>
          </tr>
        </tbody>
      </table>
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-200">
        <span className="text-xs text-slate-600" title="Valor de la mercancía menos lo que se paga. Es solo de auditoría: no bloquea nada.">
          Diferencia: {formatMoney(margin.amount, moneda)} ({formatPct(margin.pct)})
        </span>
        <Badge
          variant={margin.status === 'OK' ? 'success' : margin.status === 'WARN' ? 'warning' : 'danger'}
          size="sm"
        >
          {MARGIN_LABEL[margin.status]}
        </Badge>
      </div>
    </>
  );
}

function MarginCard({ margin, moneda }: { margin: CalcResult['margin']; moneda: string }) {
  return (
    <div className="border border-slate-200 rounded-lg p-4">
      <h4 className="text-xs font-semibold text-slate-600 uppercase mb-2">
        Auditoría: mercancía transportada vs gastos operativos
      </h4>
      {margin.basis === 'NONE' ? (
        <p className="text-xs text-slate-500">
          Este viaje no tiene pedidos con valor cargado: no se puede medir ganancia o pérdida.
        </p>
      ) : (
        <MarginDetail margin={margin} moneda={moneda} />
      )}
    </div>
  );
}

interface Props {
  explicacion: Explanation;
  result: CalcResult;
  moneda: string;
}

/** Nivel de auditoría: datos que entraron, reglas descartadas y diferencia mercancía vs gastos. */
export function AuditSection({ explicacion, result, moneda }: Props) {
  return (
    <div className="space-y-4">
      <TripVariablesCard variables={explicacion.variablesUsadas} />
      <DiscardsCard discards={explicacion.discards} />
      <MarginCard margin={result.margin} moneda={moneda} />
    </div>
  );
}
