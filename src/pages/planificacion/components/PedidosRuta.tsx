import { useMemo, useState } from 'react';
import Card from '../../../components/base/Card';
import Badge from '../../../components/base/Badge';
import PedidoCard from './PedidoCard';
import type { Pedido } from '../types';

interface Props {
  rutaNombre: string;
  pedidos: Pedido[];
  pedidosIncluidos: string[];
  pedidosAnclados: Set<string>;
  onTogglePedido: (pedido: Pedido) => void;
  onToggleAncla: (pedido: Pedido) => void;
  rutaSeleccionada: boolean;
  cargandoPedidos: boolean;
}

const GRUPOS = [
  { titulo: 'Entregas', icono: 'ri-truck-line', tipo: 'entrega' as const },
  { titulo: 'Devoluciones · recolección', icono: 'ri-arrow-go-back-line', tipo: 'devolucion' as const },
];

const filtrarPedidos = (pedidos: Pedido[], busqueda: string): Pedido[] => {
  const q = busqueda.toLowerCase().trim();
  if (!q) return pedidos;
  return pedidos.filter((p) =>
    p.order_number?.toLowerCase().includes(q) ||
    p.customer_name?.toLowerCase().includes(q) ||
    p.delivery_city?.toLowerCase().includes(q) ||
    p.delivery_zone?.toLowerCase().includes(q)
  );
};

export default function PedidosRuta({ rutaNombre, pedidos, pedidosIncluidos, pedidosAnclados, onTogglePedido, onToggleAncla, rutaSeleccionada, cargandoPedidos }: Props) {
  const [busqueda, setBusqueda] = useState('');
  const pedidosFiltrados = useMemo(() => filtrarPedidos(pedidos, busqueda), [pedidos, busqueda]);

  if (!rutaSeleccionada) {
    return (
      <Card className="h-full">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">
          <i className="ri-inbox-line mr-2 text-slate-400"></i>
          Pedidos de la Ruta
        </h2>
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <div className="w-16 h-16 flex items-center justify-center rounded-full bg-slate-50">
            <i className="ri-route-line text-4xl"></i>
          </div>
          <p className="mt-4 font-medium text-slate-500">Selecciona una ruta</p>
          <p className="text-sm mt-1 text-center">Los pedidos asignados a esa ruta aparecerán aquí automáticamente</p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
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
          <div className="relative mb-4 flex-shrink-0">
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

          <div className="space-y-4 overflow-y-auto flex-1 min-h-0">
            {pedidosFiltrados.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <i className="ri-inbox-2-line text-4xl mb-2"></i>
                <p className="font-medium">Sin pedidos pendientes</p>
                <p className="text-xs mt-1">No hay pedidos pendientes asignados a esta ruta</p>
              </div>
            ) : (
              // Separación entrega vs devolución: secciones rotuladas, no
              // tabs/filtros — el planificador necesita ver ambas clases a la
              // vez para decidir concesiones de capacidad entre ellas.
              GRUPOS.map(({ titulo, icono, tipo }) => {
                const items = pedidosFiltrados.filter(
                  (p) => !p.is_live && (tipo === 'devolucion' ? p.tipo === 'devolucion' : p.tipo !== 'devolucion'),
                );
                if (items.length === 0) return null;
                return (
                  <div key={titulo}>
                    <h3 className={`text-xs font-semibold uppercase tracking-wide mb-2 flex items-center gap-1.5 ${tipo === 'devolucion' ? 'text-indigo-700' : 'text-slate-500'}`}>
                      <i className={icono}></i>{titulo}
                      <span className="font-normal normal-case">({items.length})</span>
                    </h3>
                    <div className="space-y-2">
                      {items.map((pedido) => (
                        <PedidoCard
                          key={pedido.id}
                          pedido={pedido}
                          incluido={pedidosIncluidos.includes(pedido.id)}
                          anclado={pedidosAnclados.has(pedido.id)}
                          onToggle={onTogglePedido}
                          onToggleAncla={onToggleAncla}
                        />
                      ))}
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
