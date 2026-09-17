// "¿Por qué este total?"
//
// Es la vista que faltaba. El motor producía todo lo necesario para responder la pregunta y ninguna
// pantalla lo mostraba: las cantidades que entraron en cada línea, el acumulado, qué fila del
// tarifario ganó, el motivo de cada descarte. La función escrita para formatear eso no tenía un
// solo consumidor.
//
// Tres niveles plegables, porque hay tres lectores distintos:
//   1. RESUMEN    — un renglón por etapa. Lo que mira quien sólo va a firmar.
//   2. DETALLE    — regla por regla: por qué aplicó, cómo se calculó, cuánto, acumulado.
//   3. AUDITORÍA  — qué NO aplicó y por qué, qué números miró el motor, el costo y el margen.
//
// Vive en `components/tarifas/` porque lo usan el alta de liquidación y el Probador: si el Probador
// mostrara otra cosa, volveríamos al problema de dos pantallas que no coinciden.

import { useState } from 'react';
import Badge from '../base/Badge';
import { explainCost, explainResult, type ExplainContext } from '../../lib/tarifas/explain';
import { formatMoney, formatPct } from '../../lib/tarifas/format';
import type { CalcResult, Money } from '../../lib/tarifas/types';

interface Props {
  result: CalcResult;
  ctx: ExplainContext;
  /** Líneas que el liquidador destildó: se muestran tachadas, no escondidas. */
  excludedSeqs?: Iterable<number>;
  /** Total realmente emitido, si difiere del que dictó el motor. */
  total?: Money;
  /** Permite destildar líneas. En el Probador no aplica. */
  onToggleLine?: (seq: number) => void;
}

type Nivel = 'resumen' | 'detalle' | 'auditoria';

export default function CalcBreakdownPanel({
  result, ctx, excludedSeqs, total, onToggleLine,
}: Props) {
  const [nivel, setNivel] = useState<Nivel>('detalle');

  const explicacion = explainResult(result, ctx, { excludedSeqs, total });
  const costo = explainCost(result);
  const moneda = explicacion.currency;

  const difiere = total !== undefined && total !== result.totalLiquidado;

  return (
    <div className="space-y-4">
      {/* ── Problemas que frenan la emisión ─────────────────────────────────────────────── */}
      {explicacion.blocking.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          <p className="text-sm font-medium text-red-800 mb-1">
            <i className="ri-error-warning-line mr-1"></i>
            El total no es confiable
          </p>
          <ul className="text-xs text-red-700 space-y-0.5">
            {explicacion.blocking.map((b) => <li key={b.code + b.message}>• {b.message}</li>)}
          </ul>
        </div>
      )}

      {/* ── Selector de nivel ───────────────────────────────────────────────────────────── */}
      <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
        {([
          ['resumen', 'Resumen'],
          ['detalle', 'Detalle'],
          ['auditoria', 'Auditoría'],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setNivel(id)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
              nivel === id ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── 1 · Resumen ─────────────────────────────────────────────────────────────────── */}
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
                {difiere && (
                  <span className="block text-[11px] font-normal text-amber-700">
                    el motor calculó {formatMoney(result.totalLiquidado, moneda)}
                  </span>
                )}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* ── 2 · Detalle ─────────────────────────────────────────────────────────────────── */}
      {(nivel === 'detalle' || nivel === 'auditoria') && explicacion.stages.length > 0 && (
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
                  </td>
                  <td className="px-3 py-2 text-slate-600 max-w-[16rem]">
                    {line.porQue ?? <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-3 py-2 text-slate-600">
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
      )}

      {/* ── 3 · Auditoría ───────────────────────────────────────────────────────────────── */}
      {nivel === 'auditoria' && (
        <div className="space-y-4">
          {/* Qué números miró el motor */}
          <div className="border border-slate-200 rounded-lg p-4">
            <h4 className="text-xs font-semibold text-slate-600 uppercase mb-2">
              Datos del viaje que entraron en el cálculo
            </h4>
            {explicacion.variablesUsadas.length === 0 ? (
              <p className="text-xs text-slate-400">Ninguna regla usó datos del viaje.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {explicacion.variablesUsadas.map((v) => (
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

          {/* Qué NO aplicó y por qué */}
          <div className="border border-slate-200 rounded-lg p-4">
            <h4 className="text-xs font-semibold text-slate-600 uppercase mb-2">
              Reglas que no aplicaron
            </h4>
            {explicacion.discards.length === 0 ? (
              <p className="text-xs text-slate-400">Todas las reglas del país aplicaron.</p>
            ) : (
              <div className="space-y-3">
                {explicacion.discards.map((grupo) => (
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

          {/* Costo y margen */}
          <div className="border border-slate-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-semibold text-slate-600 uppercase">
                Costo de operar el viaje
              </h4>
              <span className="text-xs text-slate-500">
                modelo: <span className="font-mono">{result.cost.modelId}</span>
              </span>
            </div>
            {costo.length === 0 ? (
              <p className="text-xs text-slate-400">Sin desglose de costo.</p>
            ) : (
              <table className="w-full text-xs">
                <tbody className="divide-y divide-slate-100">
                  {costo.map((line) => (
                    <tr key={line.seq}>
                      <td className="py-1.5 text-slate-700">{line.label}</td>
                      <td className="py-1.5 text-slate-500">{line.como}</td>
                      <td className="py-1.5 text-right font-medium text-slate-800">
                        {formatMoney(line.monto, moneda)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t border-slate-200">
                  <tr>
                    <td className="py-1.5 font-medium text-slate-700" colSpan={2}>Total del costo</td>
                    <td className="py-1.5 text-right font-semibold text-slate-900">
                      {formatMoney(result.cost.total, moneda)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}

            <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-200">
              <span className="text-xs text-slate-600">
                Margen: {formatMoney(result.margin.amount, moneda)} ({formatPct(result.margin.pct)})
              </span>
              <Badge
                variant={
                  result.margin.status === 'OK' ? 'success'
                    : result.margin.status === 'WARN' ? 'warning' : 'danger'
                }
                size="sm"
              >
                {result.margin.status === 'OK' ? 'OK'
                  : result.margin.status === 'WARN' ? 'Atención'
                    : result.margin.status === 'CRITICAL' ? 'Crítico' : 'Pérdida'}
              </Badge>
            </div>
          </div>
        </div>
      )}

      {/* ── Avisos ──────────────────────────────────────────────────────────────────────── */}
      {explicacion.warnings.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          <p className="text-xs font-medium text-amber-800 mb-1">
            <i className="ri-alert-line mr-1"></i>
            Avisos ({explicacion.warnings.length})
          </p>
          <ul className="text-xs text-amber-700 space-y-0.5">
            {explicacion.warnings.map((w) => <li key={w}>• {w}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
