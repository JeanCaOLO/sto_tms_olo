// "Cambiar base de cálculo" del liquidador.
//
// Muestra en qué se basa hoy la fase BASE y, si la persona quiere, la deja cambiarla por otro tipo de
// cobro. Solo cambia la base: las demás fases siguen igual. Los montos nunca se teclean acá: salen
// precargados de la regla, el tarifario o la estructura de costos.
//
// KISS: cerrado es UNA línea. Todo lo demás (tipos de cobro, fórmula, explicación, avisos) aparece
// solo al marcar el check, y el detalle técnico solo en la vista extendida.

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { usePermissions } from '../../../hooks/usePermissions';
import CrearReglaBase from './CrearReglaBase';
import { BASE_RULE_TEMPLATES, describeCurrentBase, sourceSentence } from '../../../lib/tarifas/baseMethods';
import { formatInputs, formatMoney } from '../../../lib/tarifas/format';
import type { TripCalculation } from '../../../lib/tarifas/tripSettlement';
import type { BaseMethodId } from '../../../lib/tarifas/types';

interface Props {
  calculation: TripCalculation;
  /** Tipo de cobro elegido. Null = la base por defecto. */
  value: BaseMethodId | null;
  onChange: (method: BaseMethodId | null) => void;
  /** Se está recalculando: no se deja cambiar de opción a mitad de camino. */
  busy: boolean;
  extendida: boolean;
  /** Se creó una regla: hay que recalcular leyendo el catálogo de nuevo. */
  onRuleCreated: () => void;
}

export default function BaseMethodPanel({ calculation, value, onChange, busy, extendida, onRuleCreated }: Props) {
  const { isAdmin } = usePermissions();
  const [open, setOpen] = useState(value !== null);
  const [creating, setCreating] = useState(false);

  const { result, input, baseMethods } = calculation;
  const current = describeCurrentBase(result);
  const chosen = value ? baseMethods.find((m) => m.id === value) : undefined;
  const baseLines = result.trace.filter((l) => l.stage === 'BASE');
  const hasBlocked = baseMethods.some((m) => !m.available);

  const toggle = (checked: boolean) => {
    setOpen(checked);
    if (!checked && value !== null) onChange(null);
  };

  const template = value && value !== 'TENDERING' ? BASE_RULE_TEMPLATES[value] : null;

  return (
    <section className="border-t border-slate-200 pt-4">
      <h3 className="text-sm font-semibold text-slate-700 mb-2">Base del cálculo</h3>
      <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <p className="text-slate-600">
            Se calcula con: <strong className="text-slate-800">{current.label}</strong>
            {current.changed && <span className="ml-1.5 text-teal-700">(cambiada)</span>}
          </p>
          <label className="inline-flex items-center gap-2 text-slate-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={open}
              disabled={busy}
              onChange={(e) => toggle(e.target.checked)}
              className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
            />
            Cambiar base de cálculo
          </label>
        </div>

        {open && (
          <>
            <div role="radiogroup" aria-label="Tipo de cobro" className="flex flex-wrap gap-2">
              {baseMethods.map((m) => {
                const selected = value === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={!m.available || busy}
                    title={m.available ? m.hint : m.reason}
                    onClick={() => onChange(selected ? null : m.id)}
                    className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                      selected
                        ? 'bg-teal-600 border-teal-600 text-white'
                        : m.available
                          ? 'bg-white border-slate-300 text-slate-700 hover:border-teal-500 cursor-pointer'
                          : 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    {!m.available && <i className="ri-lock-line mr-1"></i>}
                    {m.label}
                  </button>
                );
              })}
            </div>

            {chosen?.available && result.base && (
              <div className="rounded-md bg-white border border-slate-200 px-3 py-2 space-y-1">
                {baseLines.map((l) => (
                  <p key={l.seq} className="text-sm text-slate-800">
                    <span className="text-slate-500 text-xs mr-1.5">{l.label}</span>
                    {formatInputs(l.inputs)} = <strong>{formatMoney(l.final, result.currency)}</strong>
                  </p>
                ))}
                <p className="text-xs text-slate-500">{sourceSentence(result.base.source)}</p>
                {isAdmin && chosen.source?.kind === 'RULE' && (
                  <Link
                    to={`/reglas-tarifa?regla=${encodeURIComponent(chosen.source.ref)}`}
                    className="inline-block text-xs text-teal-700 hover:underline"
                  >
                    <i className="ri-edit-line mr-1"></i>Editar esta regla
                  </Link>
                )}
              </div>
            )}

            {result.base && result.base.duplicates.length > 0 && (
              <div className="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-md px-3 py-2">
                <i className="ri-information-line mr-1"></i>
                {extendida
                  ? 'Se omitieron para no cobrar lo mismo dos veces:'
                  : `Se omitió${result.base.duplicates.length === 1 ? '' : 'n'} ${result.base.duplicates.length} regla${result.base.duplicates.length === 1 ? '' : 's'} que ya cobraba${result.base.duplicates.length === 1 ? '' : 'n'} lo mismo que la base.`}
                {extendida && (
                  <ul className="mt-1 space-y-0.5">
                    {result.base.duplicates.map((d) => <li key={d.ruleCode}>• <strong>{d.ruleCode}</strong>: {d.detail}</li>)}
                  </ul>
                )}
              </div>
            )}

            {extendida && result.base && result.base.replaced.length > 0 && (
              <p className="text-[11px] text-slate-500">
                Dejó de aplicar a la base: {result.base.replaced.join(', ')}.
              </p>
            )}

            {hasBlocked && (
              <p className="text-[11px] text-slate-400">
                Los tipos bloqueados no tienen información para calcular.{' '}
                {isAdmin ? (
                  <button type="button" onClick={() => setCreating(true)} className="text-teal-700 hover:underline cursor-pointer">
                    Crear una regla de base
                  </button>
                ) : (
                  'Para crear una regla pida a un administrador.'
                )}
              </p>
            )}
            {!hasBlocked && isAdmin && (
              <button type="button" onClick={() => setCreating(true)} className="text-[11px] text-teal-700 hover:underline cursor-pointer">
                Crear una regla de base
              </button>
            )}
          </>
        )}
      </div>

      {isAdmin && (
        <CrearReglaBase
          isOpen={creating}
          onClose={() => setCreating(false)}
          onCreated={() => { setCreating(false); onRuleCreated(); }}
          calculation={calculation}
          template={template}
        />
      )}
    </section>
  );
}
