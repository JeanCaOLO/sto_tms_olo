import { useState } from 'react';
import Button from '../../../components/base/Button';
import Input from '../../../components/base/Input';
import type { EngineRule, RuleParam } from '../types';

interface RuleParamsModalProps {
  rule: EngineRule;
  onSave: (params: RuleParam[]) => void;
  onCancel: () => void;
}

// Edita solo los PARÁMETROS de una regla (nunca su lógica, que vive en código).
export default function RuleParamsModal({ rule, onSave, onCancel }: RuleParamsModalProps) {
  const [params, setParams] = useState<RuleParam[]>(rule.params.map((p) => ({ ...p })));

  const setValue = (key: string, value: string) =>
    setParams((prev) => prev.map((p) => (p.key === key ? { ...p, value } : p)));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40" role="dialog" aria-modal="true" aria-label={`Parámetros de ${rule.name}`}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto scrollbar-hide">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Parámetros — {rule.name}</h3>
            <p className="text-sm text-slate-600 mt-1">{rule.description}</p>
          </div>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600 cursor-pointer ml-4 shrink-0" aria-label="Cerrar">
            <i className="ri-close-line text-xl"></i>
          </button>
        </div>

        <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 mb-4 flex items-start gap-2">
          <i className="ri-lock-2-line text-slate-400 mt-0.5"></i>
          <p className="text-xs text-slate-500">
            La lógica de la regla es de solo lectura (implementada en código). Aquí solo se editan sus parámetros.
          </p>
        </div>

        {params.length === 0 ? (
          <p className="text-sm text-slate-500">Esta regla no tiene parámetros configurables.</p>
        ) : (
          <div className="space-y-4">
            {params.map((p) => (
              <Input
                key={p.key}
                label={p.label}
                type={p.kind === 'number' ? 'number' : p.kind === 'time' ? 'time' : 'text'}
                value={p.value}
                onChange={(e) => setValue(p.key, e.target.value)}
                error={undefined}
              />
            ))}
          </div>
        )}

        {params.some((p) => p.help) && (
          <ul className="mt-4 space-y-1">
            {params.filter((p) => p.help).map((p) => (
              <li key={p.key} className="text-xs text-slate-500">
                <span className="font-medium">{p.label}:</span> {p.help}
              </li>
            ))}
          </ul>
        )}

        <div className="flex justify-end gap-2 mt-6">
          <Button variant="secondary" onClick={onCancel}>Cancelar</Button>
          <Button variant="primary" onClick={() => onSave(params)}>Guardar parámetros</Button>
        </div>
      </div>
    </div>
  );
}
