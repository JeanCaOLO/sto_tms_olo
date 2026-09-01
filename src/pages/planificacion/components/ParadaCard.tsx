import Badge from '../../../components/base/Badge';
import StopBadge from './StopBadge';
import TipoParadaBadge from './TipoParadaBadge';
import { formatEta } from '../time-windows';
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
  const etaLabel = pedido.eta_min != null && pedido.eta_min >= 0 ? formatEta(pedido.eta_min) : null;

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
          pedido.tipo === 'devolucion' ? 'border-l-4 border-l-indigo-500 ' : ''
        }${
          pedido.outside_window
            ? 'border-red-300 bg-red-50'
            : isDragging ? 'border-teal-400 shadow-lg opacity-50' : 'border-slate-200 hover:border-teal-300 hover:shadow-sm'
        }`}
      >
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-800">{pedido.order_number}</span>
                <TipoParadaBadge tipo={pedido.tipo} />
                {etaLabel && (
                  <span className={`text-xs font-medium ${pedido.outside_window ? 'text-red-600' : 'text-teal-700'}`}>
                    <i className="ri-time-line mr-0.5"></i>{etaLabel}
                  </span>
                )}
                {pedido.outside_window && (
                  <Badge variant="danger" className="text-xs">
                    <i className="ri-alarm-warning-line mr-0.5"></i>Fuera de ventana
                  </Badge>
                )}
              </div>
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

            {pedido.is_exception && pedido.exception_address_raw && (
              <p className="mb-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 flex items-start gap-1">
                <i className="ri-map-pin-off-line mt-0.5 flex-shrink-0"></i>
                <span>{pedido.exception_address_raw}</span>
              </p>
            )}

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
