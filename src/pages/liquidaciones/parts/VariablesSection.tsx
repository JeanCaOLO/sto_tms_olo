// Section for trip variables and constants in settlement emission.

import Input from '../../../components/base/Input';
import { constantVars } from '../../../lib/tarifas/customVarFields';
import type { TripCalculation } from '../../../lib/tarifas/tripSettlement';

interface Props {
  calculation: TripCalculation;
  customRaw: Record<string, string>;
  onSetRaw: (key: string, value: string) => void;
  simple: boolean;
}

export function VariablesSection({ calculation, customRaw, onSetRaw, simple }: Props) {
  const constantes = constantVars(calculation.input.partyVariables ?? []);

  if (calculation.customVarFields.length === 0 && (simple || constantes.length === 0)) {
    return null;
  }

  return (
    <section className="border-t border-slate-200 pt-4">
      <h3 className="text-sm font-semibold text-slate-700 mb-3">
        {simple ? 'Variables de este viaje' : '2 · Variables de este viaje'}
      </h3>

      {calculation.customVarFields.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {calculation.customVarFields.map((f) => (
            <Input
              key={f.key}
              label={f.unit ? `${f.label} (${f.unit})` : f.label}
              type={f.kind === 'NUMBER' ? 'number' : 'text'}
              value={customRaw[f.key] ?? ''}
              onChange={(e) => onSetRaw(f.key, e.target.value)}
            />
          ))}
        </div>
      )}

      {!simple && constantes.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {constantes.map((c) => (
            <span key={c.key} className="px-2 py-1 text-xs bg-slate-100 rounded-full text-slate-600">
              {c.label}: <strong>{c.defaultValue}</strong>
              <span className="text-slate-400 ml-1">fija del transportista</span>
            </span>
          ))}
        </div>
      )}

      {!simple && calculation.undeclaredVars.length > 0 && (
        <p className="text-xs text-amber-700 mt-2">
          Hay reglas que usan variables que el transportista no declaró (valen 0):{' '}
          {calculation.undeclaredVars.join(', ')}.
        </p>
      )}
    </section>
  );
}
