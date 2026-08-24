import StopBadge from './StopBadge';
import type { PedidoSeleccionado } from '../types';

interface Props {
  pedido: PedidoSeleccionado;
  onClose: () => void;
}

export default function ParadaDetalleModal({ pedido, onClose }: Props) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[2000] p-4" onClick={onClose}>
      <div className="bg-white rounded-lg w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="border-b border-slate-100 px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <StopBadge number={pedido.stop_number} size="sm" />
            <h2 className="font-semibold text-slate-800">{pedido.order_number}</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 w-8 h-8 flex items-center justify-center cursor-pointer">
            <i className="ri-close-line text-xl"></i>
          </button>
        </div>

        <div className="p-5 space-y-2 text-sm text-slate-600">
          <p className="flex items-center"><i className="ri-user-line mr-2 text-slate-400"></i>{pedido.customer_name || 'Sin nombre'}</p>
          <p className="flex items-start"><i className="ri-map-pin-line mr-2 mt-0.5 text-slate-400"></i>{pedido.delivery_address}, {pedido.delivery_city}</p>
          <p className="flex items-center"><i className="ri-road-map-line mr-2 text-slate-400"></i>Zona: {pedido.delivery_zone}</p>
          <div className="flex items-center gap-4 pt-1">
            <span className="flex items-center"><i className="ri-weight-line mr-1 text-slate-400"></i>{pedido.total_weight} kg</span>
            <span className="flex items-center"><i className="ri-box-3-line mr-1 text-slate-400"></i>{pedido.total_volume} m³</span>
          </div>
        </div>
      </div>
    </div>
  );
}
