import { useState } from 'react';
import Button from '../../../components/base/Button';
import Input from '../../../components/base/Input';
import Select from '../../../components/base/Select';
import type { PriorityRule, RuleOperator } from '../types';

interface RuleFormModalProps {
  profile: string;
  onSave: (rule: Omit<PriorityRule, 'id' | 'profile'>) => void;
  onCancel: () => void;
}

const OPERATORS: { value: RuleOperator; label: string }[] = [
  { value: 'igual', label: 'igual (=)' },
  { value: 'distinto', label: 'distinto (≠)' },
  { value: 'mayor', label: 'mayor (>)' },
  { value: 'menor', label: 'menor (<)' },
  { value: 'mayor-igual', label: 'mayor o igual (≥)' },
  { value: 'menor-igual', label: 'menor o igual (≤)' },
  { value: 'contiene', label: 'contiene' },
];

// FR5.1 — alta de regla: nombre (1–100), condición (campo/operador/valor),
// peso (1–1000) y estado inicial. Mock: no persiste fuera de la sesión.
export default function RuleFormModal({ profile, onSave, onCancel }: RuleFormModalProps) {
  const [name, setName] = useState('');
  const [field, setField] = useState('');
  const [operator, setOperator] = useState<RuleOperator>('igual');
  const [value, setValue] = useState('');
  const [weight, setWeight] = useState('100');
  const [active, setActive] = useState(true);

  const weightNum = Number(weight);
  const valid =
    name.trim().length >= 1 && name.trim().length <= 100 &&
    field.trim().length > 0 &&
    value.trim().length > 0 &&
    Number.isInteger(weightNum) && weightNum >= 1 && weightNum <= 1000;

  const submit = () => {
    if (!valid) return;
    onSave({ name: name.trim(), field: field.trim(), operator, value: value.trim(), weight: weightNum, active });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40" role="dialog" aria-modal="true" aria-label="Nueva regla">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-900">Nueva regla — {profile}</h3>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600 cursor-pointer" aria-label="Cerrar">
            <i className="ri-close-line text-xl"></i>
          </button>
        </div>

        <div className="space-y-4">
          <Input label="Nombre" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej.: Fecha de despacho vencida" maxLength={100} />

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Condición</label>
            <div className="grid grid-cols-3 gap-2">
              <Input placeholder="Campo" value={field} onChange={(e) => setField(e.target.value)} />
              <Select value={operator} onChange={(e) => setOperator(e.target.value as RuleOperator)} options={OPERATORS} />
              <Input placeholder="Valor" value={value} onChange={(e) => setValue(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input label="Peso (1–1000)" type="number" min={1} max={1000} value={weight} onChange={(e) => setWeight(e.target.value)} />
            <Select
              label="Estado inicial"
              value={active ? 'activa' : 'inactiva'}
              onChange={(e) => setActive(e.target.value === 'activa')}
              options={[{ value: 'activa', label: 'Activa' }, { value: 'inactiva', label: 'Inactiva' }]}
            />
          </div>

          {!valid && (name.length > 0 || field.length > 0 || value.length > 0) && (
            <p className="text-sm text-amber-600">Completa nombre, campo, valor y un peso entero entre 1 y 1000.</p>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <Button variant="secondary" onClick={onCancel}>Cancelar</Button>
          <Button variant="primary" disabled={!valid} onClick={submit}>Crear regla</Button>
        </div>
      </div>
    </div>
  );
}
