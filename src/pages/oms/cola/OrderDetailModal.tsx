import Button from '../../../components/base/Button';
import PriorityBadge from '../components/PriorityBadge';
import type { QueueOrder } from '../types';

interface OrderDetailModalProps {
  order: QueueOrder;
  onOverride: () => void;
  onClose: () => void;
}

// FR3.6 — detalle del pedido en modal (reemplaza el panel lateral). Incluye el
// desglose de reglas (suma = score, FR5.5) y el botón de alterar prioridad.
export default function OrderDetailModal({ order, onOverride, onClose }: OrderDetailModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40" role="dialog" aria-modal="true" aria-label={`Detalle del pedido ${order.id}`}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-xl p-6 max-h-[90vh] overflow-y-auto scrollbar-hide">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-semibold text-slate-900">{order.id}</h3>
            <PriorityBadge tier={order.tier} />
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 cursor-pointer" aria-label="Cerrar">
            <i className="ri-close-line text-xl"></i>
          </button>
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm mb-5">
          <div className="flex justify-between"><span className="text-slate-500">Referencia</span><span className="text-slate-900 font-medium">{order.ref}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Cliente</span><span className="text-slate-900">{order.customer}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Ruta</span><span className="text-slate-900">{order.route}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Artículos</span><span className="text-slate-900">{order.itemCount}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Fecha despacho</span><span className="text-slate-900">{order.dispatchDate}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Fecha Alisto</span><span className="text-slate-900">{order.readyToPrepDate}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Ingreso</span><span className="text-slate-900">{order.intakeTime}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Estado</span><span className="text-slate-900">{order.status}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Situación</span><span className="text-slate-900">{order.situation}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Score</span><span className="text-slate-900 font-semibold">{order.score}</span></div>
        </div>

        <div className="mb-5">
          <h4 className="text-sm font-semibold text-slate-900 mb-2">Reglas aplicadas</h4>
          {order.appliedRules.length === 0 ? (
            <p className="text-sm text-slate-500">Sin reglas aplicables · score 0 · prioridad más baja.</p>
          ) : (
            <ul className="text-sm space-y-1">
              {order.appliedRules.map((r) => (
                <li key={r.name} className="flex justify-between">
                  <span className="text-slate-600">{r.name}</span>
                  <span className="font-medium text-slate-900">+{r.weight}</span>
                </li>
              ))}
              <li className="flex justify-between border-t border-slate-100 pt-1 mt-1">
                <span className="text-slate-500">Suma = score</span>
                <span className="font-semibold text-slate-900">{order.score}</span>
              </li>
            </ul>
          )}
        </div>

        <div className="mb-6">
          <h4 className="text-sm font-semibold text-slate-900 mb-2">Historial de prioridad</h4>
          <ul className="text-xs space-y-1 text-slate-600">
            {order.history.map((h, i) => (
              <li key={i}>
                {h.at} · P{h.from === 'sin asignar' ? '—' : h.from} → P{h.to} ({h.type}){h.reason ? ` — ${h.reason}` : ''}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cerrar</Button>
          <Button variant="primary" icon={<i className="ri-edit-line"></i>} onClick={onOverride}>Alterar prioridad</Button>
        </div>
      </div>
    </div>
  );
}
