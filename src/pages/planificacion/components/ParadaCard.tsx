import StopBadge from './StopBadge';
import type { PedidoSeleccionado } from '../types';

interface Props {
  pedido: PedidoSeleccionado;
  isLast: boolean;
  isDragging: boolean;
  onQuitar: (pedidoId: string) => void;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onEnfocar?: (pedidoId: string) => void;
}

export default function ParadaCard({ pedido, isLast, isDragging, onQuitar, onDragStart, onDragOver, onDragEnd, onEnfocar }: Props) {
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center flex-shrink-0">
        <StopBadge number={pedido.stop_number} />
        {!isLast && <div className="w-px flex-1 bg-slate-200 my-1"></div>}
      </div>

      <div
        draggable
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDoubleClick={() => onEnfocar?.(pedido.id)}
        title={onEnfocar ? 'Doble-click para enfocar en el mapa' : undefined}
        className={`flex-1 min-w-0 border rounded-lg p-3 bg-white transition-all cursor-move mb-2 ${
          isDragging ? 'border-teal-400 shadow-lg opacity-50' : 'border-slate-200 hover:border-teal-300 hover:shadow-sm'
        }`}
      >
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <span className="font-semibold text-slate-800">{pedido.order_number}</span>
              <button
                onClick={() => onQuitar(pedido.id)}
                className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors whitespace-nowrap"
              >
                <i className="ri-close-line"></i>
              </button>
            </div>

            <p className="text-sm text-slate-600 mb-2 flex items-center">
              <i className="ri-user-line mr-1 text-slate-400"></i>
              {pedido.customer_name}
            </p>

            <div className="space-y-1 text-xs text-slate-500">
              <div className="flex items-start">
                <i className="ri-map-pin-line mr-1 mt-0.5 flex-shrink-0"></i>
                <span className="break-words">{pedido.delivery_address}, {pedido.delivery_city}</span>
              </div>
              <div className="flex items-center">
                <i className="ri-road-map-line mr-1"></i>
                <span>Zona: {pedido.delivery_zone}</span>
              </div>
              <div className="flex items-center gap-3 mt-2">
                <span className="flex items-center"><i className="ri-weight-line mr-1"></i>{pedido.total_weight} kg</span>
                <span className="flex items-center"><i className="ri-box-3-line mr-1"></i>{pedido.total_volume} m³</span>
              </div>
            </div>
          </div>

          <div className="flex-shrink-0 text-slate-400 cursor-move">
            <i className="ri-draggable text-lg"></i>
          </div>
        </div>
      </div>
    </div>
  );
}
