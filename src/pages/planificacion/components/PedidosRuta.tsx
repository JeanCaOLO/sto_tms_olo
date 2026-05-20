import { useMemo, useState } from 'react';
import Card from '../../../components/base/Card';
import Badge from '../../../components/base/Badge';

interface Pedido {
  id: string;
  order_number: string;
  customer_id: string;
  store_id: string;
  delivery_address: string;
  delivery_city: string;
  delivery_zone: string;
  total_weight: number;
  total_volume: number;
  status: string;
  order_date: string;
  delivery_latitude?: number;
  delivery_longitude?: number;
  customer_name?: string;
  store_name?: string;
  route_type_id?: string;
}

interface Props {
  rutaNombre: string;
  pedidos: Pedido[];
  pedidosIncluidos: string[];
  onTogglePedido: (pedido: Pedido) => void;
  rutaSeleccionada: boolean;
  cargandoPedidos: boolean;
}

export default function PedidosRuta({
  rutaNombre,
  pedidos,
  pedidosIncluidos,
  onTogglePedido,
  rutaSeleccionada,
  cargandoPedidos,
}: Props) {
  const [busqueda, setBusqueda] = useState('');

  const pedidosFiltrados = useMemo(() => {
    const q = busqueda.toLowerCase().trim();
    if (!q) return pedidos;
    return pedidos.filter((p) =>
      p.order_number?.toLowerCase().includes(q) ||
      p.customer_name?.toLowerCase().includes(q) ||
      p.delivery_city?.toLowerCase().includes(q) ||
      p.delivery_zone?.toLowerCase().includes(q)
    );
  }, [pedidos, busqueda]);

  if (!rutaSeleccionada) {
    return (
      <Card className="h-full">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">
          <i className="ri-inbox-line mr-2 text-slate-400"></i>
          Pedidos de la Ruta
        </h2>
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <div className="w-16 h-16 flex items-center justify-center">
            <i className="ri-route-line text-5xl"></i>
          </div>
          <p className="mt-4 font-medium text-slate-500">Selecciona una ruta</p>
          <p className="text-sm mt-1 text-center">Los pedidos asignados a esa ruta aparecerán aquí automáticamente</p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="h-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">
            <i className="ri-inbox-line mr-2 text-teal-600"></i>
            Pedidos — {rutaNombre}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">Pedidos pendientes asignados a esta ruta</p>
        </div>
        <Badge variant="info">{pedidos.length} pedidos</Badge>
      </div>

      {cargandoPedidos ? (
        <div className="flex items-center justify-center py-16 text-slate-400">
          <i className="ri-loader-4-line animate-spin text-2xl mr-2"></i>
          <span>Cargando pedidos...</span>
        </div>
      ) : (
        <>
          <div className="relative mb-4">
            <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-slate-400">
              <i className="ri-search-line text-sm"></i>
            </div>
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar pedido, cliente, ciudad..."
              className="w-full pl-9 pr-9 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent placeholder-slate-400"
            />
            {busqueda && (
              <button onClick={() => setBusqueda('')} className="absolute inset-y-0 right-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer">
                <i className="ri-close-line text-sm"></i>
              </button>
            )}
          </div>

          <div className="space-y-2 max-h-[560px] overflow-y-auto">
            {pedidosFiltrados.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <i className="ri-inbox-2-line text-4xl mb-2"></i>
                <p className="font-medium">Sin pedidos pendientes</p>
                <p className="text-xs mt-1">No hay pedidos pendientes asignados a esta ruta</p>
              </div>
            ) : (
              pedidosFiltrados.map((pedido) => {
                const incluido = pedidosIncluidos.includes(pedido.id);
                return (
                  <div
                    key={pedido.id}
                    className={`border rounded-lg p-3 transition-all ${
                      incluido
                        ? 'border-teal-300 bg-teal-50'
                        : 'border-slate-200 bg-white hover:border-slate-300 opacity-60'
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
                        onClick={() => onTogglePedido(pedido)}
                        className={`flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                          incluido
                            ? 'bg-red-50 text-red-500 hover:bg-red-100'
                            : 'bg-teal-600 text-white hover:bg-teal-700'
                        }`}
                        title={incluido ? 'Excluir de la ruta' : 'Incluir en la ruta'}
                      >
                        <i className={incluido ? 'ri-close-line' : 'ri-add-line'}></i>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}
    </Card>
  );
}
