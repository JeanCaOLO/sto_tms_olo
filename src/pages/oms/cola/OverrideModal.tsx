import { useState } from 'react';
import Button from '../../../components/base/Button';

interface OverrideModalProps {
  orderId: string;
  currentPriority: number | null;
  onConfirm: (priority: number, reason: string) => void;
  onCancel: () => void;
}

// FR3.4 — modal de override: nueva prioridad numérica (0..n, menor = más urgente)
// + motivo obligatorio (≥10 chars). La escala es la del OMS (DECIDED 2026-10-29):
// 0 = liberar de inmediato; la cola normalmente es >= 1.
export default function OverrideModal({ orderId, currentPriority, onConfirm, onCancel }: OverrideModalProps) {
  const [priority, setPriority] = useState<string>(currentPriority != null ? String(currentPriority) : '1');
  const [reason, setReason] = useState('');
  const n = Number(priority);
  const priorityValid = priority.trim() !== '' && Number.isInteger(n) && n >= 0;
  const valid = priorityValid && reason.trim().length >= 10;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40" role="dialog" aria-modal="true" aria-label="Alterar prioridad">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-900">Alterar prioridad — {orderId}</h3>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600 cursor-pointer" aria-label="Cerrar">
            <i className="ri-close-line text-xl"></i>
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Nueva prioridad (número, menor = más urgente)</label>
            <input
              type="number"
              min={0}
              step={1}
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
            />
            {!priorityValid && priority.length > 0 && (
              <p className="mt-1 text-sm text-red-600">La prioridad debe ser un entero ≥ 0.</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Motivo (obligatorio, mín. 10 caracteres)</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
              placeholder="Ej.: viaje extra pagado por el cliente"
            />
            {reason.length > 0 && reason.trim().length < 10 && (
              <p className="mt-1 text-sm text-red-600">El motivo debe tener al menos 10 caracteres.</p>
            )}
          </div>
          <p className="text-xs text-slate-500">
            El cambio recalcula el score, reordena la cola y queda registrado en la Auditoría
            de Priorización. Es la única intervención humana permitida sobre el cálculo.
          </p>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <Button variant="secondary" onClick={onCancel}>Cancelar</Button>
          <Button variant="primary" disabled={!valid} onClick={() => onConfirm(n, reason.trim())}>
            Confirmar override
          </Button>
        </div>
      </div>
    </div>
  );
}
