import Button from '../../../components/base/Button';
import type { QueueOrder } from '../types';

interface BandejaDetailModalProps {
  order: QueueOrder;
  onClose: () => void;
}

// Detalle del pedido en Bandeja (solo lectura). A diferencia del detalle de la
// Cola, no muestra prioridad/score/estado/situación ni el override: en la bandeja
// el pedido todavía no está priorizado.
export default function BandejaDetailModal({ order, onClose }: BandejaDetailModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40" role="dialog" aria-modal="true" aria-label={`Detalle del pedido ${order.ref}`}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-xl p-6 max-h-[90vh] overflow-y-auto scrollbar-hide">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-900">{order.ref}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 cursor-pointer" aria-label="Cerrar">
            <i className="ri-close-line text-xl"></i>
          </button>
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm mb-5">
          <div className="flex justify-between"><span className="text-slate-500">Tipo de Orden</span><span className="text-slate-900">{order.orderType}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">ID Almacén</span><span className="text-slate-900">{order.warehouseId}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">ID Compañía</span><span className="text-slate-900">{order.companyId}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">ID Sucursal</span><span className="text-slate-900">{order.branchId}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Cliente</span><span className="text-slate-900">{order.customer}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Zona</span><span className="text-slate-900">{order.route}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Monto Total</span><span className="text-slate-900">{order.totalAmount.toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Peso (kg)</span><span className="text-slate-900">{order.weight.toFixed(1)}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Volumen (m³)</span><span className="text-slate-900">{order.volume.toFixed(1)}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Artículos</span><span className="text-slate-900">{order.itemCount}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Fecha entrega</span><span className="text-slate-900">{order.dispatchDate}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Fecha creación</span><span className="text-slate-900">{order.createdDate}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Ingreso</span><span className="text-slate-900">{order.intakeTime}</span></div>
        </div>

        <div className="mb-6">
          <span className="text-sm text-slate-500">Observaciones</span>
          <p className="text-sm text-slate-900 mt-1">{order.observations}</p>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cerrar</Button>
        </div>
      </div>
    </div>
  );
}
