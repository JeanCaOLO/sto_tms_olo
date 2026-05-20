import { useState } from 'react';
import Card from '../../../components/base/Card';
import Badge from '../../../components/base/Badge';

interface PedidoSeleccionado {
  id: string;
  order_number: string;
  customer_name?: string;
  delivery_address: string;
  delivery_city: string;
  delivery_zone: string;
  total_weight: number;
  total_volume: number;
  stop_number: number;
}

interface Props {
  pedidosSeleccionados: PedidoSeleccionado[];
  onQuitarPedido: (pedidoId: string) => void;
  onReordenarParadas: (fromIndex: number, toIndex: number) => void;
}

export default function RutaEnConstruccion({
  pedidosSeleccionados,
  onQuitarPedido,
  onReordenarParadas
}: Props) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex !== null && draggedIndex !== index) {
      onReordenarParadas(draggedIndex, index);
      setDraggedIndex(index);
    }
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  const totalWeight = pedidosSeleccionados.reduce((sum, p) => sum + (p.total_weight || 0), 0);
  const totalVolume = pedidosSeleccionados.reduce((sum, p) => sum + (p.total_volume || 0), 0);

  return (
    <Card className="h-full">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-800">
          <i className="ri-route-line mr-2"></i>
          Ruta en Construcción
        </h2>
        <Badge variant="warning">{pedidosSeleccionados.length} paradas</Badge>
      </div>

      {pedidosSeleccionados.length > 0 && (
        <div className="bg-slate-50 rounded-lg p-3 mb-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-slate-500">Peso Total:</span>
              <span className="font-semibold text-slate-800 ml-2">{totalWeight.toFixed(2)} kg</span>
            </div>
            <div>
              <span className="text-slate-500">Volumen Total:</span>
              <span className="font-semibold text-slate-800 ml-2">{totalVolume.toFixed(2)} m³</span>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-2 max-h-[600px] overflow-y-auto">
        {pedidosSeleccionados.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <i className="ri-route-line text-4xl mb-2"></i>
            <p>Selecciona pedidos para armar la ruta</p>
            <p className="text-xs mt-1">Los pedidos aparecerán aquí</p>
          </div>
        ) : (
          pedidosSeleccionados.map((pedido, index) => (
            <div
              key={pedido.id}
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragEnd={handleDragEnd}
              className={`border rounded-lg p-3 bg-white transition-all cursor-move ${
                draggedIndex === index
                  ? 'border-teal-400 shadow-lg opacity-50'
                  : 'border-slate-200 hover:border-teal-300 hover:shadow-sm'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-8 h-8 bg-teal-600 text-white rounded-lg flex items-center justify-center font-bold">
                  {pedido.stop_number}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-slate-800">{pedido.order_number}</span>
                    <button
                      onClick={() => onQuitarPedido(pedido.id)}
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

                <div className="flex-shrink-0 text-slate-400 cursor-move">
                  <i className="ri-draggable text-lg"></i>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {pedidosSeleccionados.length > 0 && (
        <div className="mt-4 p-3 bg-teal-50 border border-teal-200 rounded-lg">
          <div className="flex items-start gap-2 text-sm text-teal-800">
            <i className="ri-magic-line mt-0.5"></i>
            <p>Usa <strong>Optimizar paradas</strong> para calcular la secuencia de entrega más eficiente, o arrastra para reordenar manualmente.</p>
          </div>
        </div>
      )}
    </Card>
  );
}