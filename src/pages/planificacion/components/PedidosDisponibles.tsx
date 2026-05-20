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
  customer_name?: string;
  store_name?: string;
}

interface Props {
  pedidos: Pedido[];
  pedidosSeleccionados: any[];
  onAgregarPedido: (pedido: Pedido) => void;
  filtroTienda: string;
  filtroZona: string;
  filtroCliente: string;
  filtroFecha: string;
  setFiltroTienda: (value: string) => void;
  setFiltroZona: (value: string) => void;
  setFiltroCliente: (value: string) => void;
  setFiltroFecha: (value: string) => void;
}

export default function PedidosDisponibles({
  pedidos,
  pedidosSeleccionados,
  onAgregarPedido,
  filtroTienda,
  filtroZona,
  filtroCliente,
  filtroFecha,
  setFiltroTienda,
  setFiltroZona,
  setFiltroCliente,
  setFiltroFecha,
}: Props) {
  const [busqueda, setBusqueda] = useState('');

  const pedidosFiltrados = useMemo(() => {
    const q = busqueda.toLowerCase().trim();
    return pedidos.filter((pedido) => {
      if (!q) return true;
      return (
        pedido.order_number?.toLowerCase().includes(q) ||
        pedido.customer_name?.toLowerCase().includes(q) ||
        pedido.store_name?.toLowerCase().includes(q) ||
        pedido.delivery_zone?.toLowerCase().includes(q) ||
        pedido.delivery_city?.toLowerCase().includes(q) ||
        pedido.delivery_address?.toLowerCase().includes(q)
      );
    });
  }, [pedidos, busqueda]);

  const estaSeleccionado = (pedidoId: string) =>
    pedidosSeleccionados.some((p) => p.id === pedidoId);

  return (
    <Card className="h-full">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-800">
          <i className="ri-inbox-line mr-2"></i>
          Pedidos Disponibles
        </h2>
        <Badge variant="info">{pedidosFiltrados.length} pedidos</Badge>
      </div>

      {/* Buscador unificado */}
      <div className="relative mb-4">
        <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-slate-400">
          <i className="ri-search-line text-base"></i>
        </div>
        <input
          type="text"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por pedido, cliente, tienda, zona o ciudad..."
          className="w-full pl-9 pr-9 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent placeholder-slate-400"
        />
        {busqueda && (
          <button
            onClick={() => setBusqueda('')}
            className="absolute inset-y-0 right-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
          >
            <i className="ri-close-line text-base"></i>
          </button>
        )}
      </div>

      <div className="space-y-2 max-h-[600px] overflow-y-auto">
        {pedidosFiltrados.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <i className="ri-inbox-line text-4xl mb-2"></i>
            <p>No hay pedidos disponibles</p>
            {busqueda && (
              <p className="text-xs mt-1">Intenta con otro término de búsqueda</p>
            )}
          </div>
        ) : (
          pedidosFiltrados.map((pedido) => {
            const seleccionado = estaSeleccionado(pedido.id);

            return (
              <div
                key={pedido.id}
                className={`border rounded-lg p-3 transition-all ${
                  seleccionado
                    ? 'border-teal-300 bg-teal-50 opacity-50'
                    : 'border-slate-200 bg-white hover:border-teal-400 hover:shadow-sm'
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-slate-800">{pedido.order_number}</span>
                      {seleccionado && (
                        <Badge variant="success" className="text-xs">
                          <i className="ri-check-line mr-1"></i>
                          Agregado
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-slate-600 flex items-center">
                      <i className="ri-user-line mr-1 text-slate-400"></i>
                      {pedido.customer_name}
                    </p>
                  </div>
                  <button
                    onClick={() => !seleccionado && onAgregarPedido(pedido)}
                    disabled={seleccionado}
                    className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors whitespace-nowrap ${
                      seleccionado
                        ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                        : 'bg-teal-600 text-white hover:bg-teal-700 cursor-pointer'
                    }`}
                  >
                    <i className={seleccionado ? 'ri-check-line' : 'ri-add-line'}></i>
                  </button>
                </div>

                <div className="space-y-1 text-xs text-slate-500">
                  <div className="flex items-center">
                    <i className="ri-store-2-line mr-1"></i>
                    <span>{pedido.store_name}</span>
                  </div>
                  <div className="flex items-center">
                    <i className="ri-map-pin-line mr-1"></i>
                    <span>{pedido.delivery_address}, {pedido.delivery_city}</span>
                  </div>
                  <div className="flex items-center">
                    <i className="ri-road-map-line mr-1"></i>
                    <span>Zona: {pedido.delivery_zone}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-2">
                    <span className="flex items-center">
                      <i className="ri-weight-line mr-1"></i>
                      {pedido.total_weight} kg
                    </span>
                    <span className="flex items-center">
                      <i className="ri-box-3-line mr-1"></i>
                      {pedido.total_volume} m³
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </Card>
  );
}
