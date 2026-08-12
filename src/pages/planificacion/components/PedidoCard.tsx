import Badge from '../../../components/base/Badge';
import type { Pedido } from '../types';

interface Props {
  pedido: Pedido;
  incluido: boolean;
  onToggle: (pedido: Pedido) => void;
}

export default function PedidoCard({ pedido, incluido, onToggle }: Props) {
  return (
    <div
      className={`border rounded-lg p-3 transition-all ${
        incluido ? 'border-teal-300 bg-teal-50' : 'border-slate-200 bg-white hover:border-slate-300 opacity-60'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold text-slate-800 text-sm">{pedido.order_number}</span>
            {incluido ? (
              <Badge variant="success" className="text-xs">En ruta</Badge>
            ) : (
              <Badge variant="default" className="text-xs">Excluido</Badge>
            )}
          </div>
          <p className="text-sm text-slate-600 flex items-center">
            <i className="ri-user-line mr-1 text-slate-400 text-xs"></i>
            {pedido.customer_name}
          </p>
          <div className="mt-1 space-y-0.5 text-xs text-slate-500">
            <div className="flex items-center">
              <i className="ri-map-pin-line mr-1"></i>
              {pedido.delivery_address}, {pedido.delivery_city}
            </div>
            <div className="flex items-center gap-3">
              <span><i className="ri-road-map-line mr-1"></i>{pedido.delivery_zone}</span>
              <span><i className="ri-weight-line mr-1"></i>{pedido.total_weight} kg</span>
              <span><i className="ri-box-3-line mr-1"></i>{pedido.total_volume} m³</span>
            </div>
          </div>
        </div>

        <button
          onClick={() => onToggle(pedido)}
          className={`flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
            incluido ? 'bg-red-50 text-red-500 hover:bg-red-100' : 'bg-teal-600 text-white hover:bg-teal-700'
          }`}
          title={incluido ? 'Excluir de la ruta' : 'Incluir en la ruta'}
        >
          <i className={incluido ? 'ri-close-line' : 'ri-add-line'}></i>
        </button>
      </div>
    </div>
  );
}
