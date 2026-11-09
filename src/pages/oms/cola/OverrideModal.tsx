import { useState } from 'react';
import Button from '../../../components/base/Button';

interface LiberarPedidoModalProps {
  orderId: string;
  busy?: boolean;
  error?: string | null;
  onConfirm: (motivo: string) => void;
  onCancel: () => void;
}

// FR4 — modal "Liberar pedido" (DECIDED 2026-11-04): la única intervención manual del
// Responsable del OMS es liberar el pedido. Sin input numérico; motivo opcional.
// Cofersa: prioridad 0; EPA: conserva la suya. Ignora la ventana de liberación.
// (El archivo conserva el nombre OverrideModal.tsx por historial; el componente es LiberarPedidoModal.)
export default function LiberarPedidoModal({ orderId, busy = false, error = null, onConfirm, onCancel }: LiberarPedidoModalProps) {
  const [motivo, setMotivo] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40" role="dialog" aria-modal="true" aria-label="Liberar pedido">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-900">Liberar pedido — {orderId}</h3>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600 cursor-pointer" aria-label="Cerrar">
            <i className="ri-close-line text-xl"></i>
          </button>
        </div>

        <div className="space-y-4">
          <p className="text-sm text-slate-700">
            Esto envía el pedido a eFlow ahora mismo, como generado (GENE), sin esperar su fecha de
            liberación. Si es de Cofersa, queda con prioridad 0; si es de EPA, conserva su prioridad
            de origen. Después sale de la cola y queda registrado en la Auditoría.
          </p>
          <div>
            <label htmlFor="liberar-motivo" className="block text-sm font-medium text-slate-700 mb-1.5">Motivo (opcional)</label>
            <textarea
              id="liberar-motivo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
              placeholder="Ej.: viaje extra pagado por el cliente"
            />
          </div>
          {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>Cancelar</Button>
          <Button variant="primary" disabled={busy} onClick={() => onConfirm(motivo.trim())}>
            {busy ? 'Liberando…' : 'Liberar pedido'}
          </Button>
        </div>
      </div>
    </div>
  );
}
