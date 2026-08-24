import { useState } from 'react';
import Card from '../../../components/base/Card';
import Badge from '../../../components/base/Badge';
import ParadaCard from './ParadaCard';
import RutaMapaPreview from './RutaMapaPreview';
import type { PedidoSeleccionado } from '../types';

interface Props {
  pedidosSeleccionados: PedidoSeleccionado[];
  onQuitarPedido: (pedidoId: string) => void;
  onReordenarParadas: (fromIndex: number, toIndex: number) => void;
}

export default function RutaEnConstruccion({ pedidosSeleccionados, onQuitarPedido, onReordenarParadas }: Props) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [paradaEnfocadaId, setParadaEnfocadaId] = useState<string>();

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex !== null && draggedIndex !== index) {
      onReordenarParadas(draggedIndex, index);
      setDraggedIndex(index);
    }
  };

  const totalWeight = pedidosSeleccionados.reduce((sum, p) => sum + (p.total_weight || 0), 0);
  const totalVolume = pedidosSeleccionados.reduce((sum, p) => sum + (p.total_volume || 0), 0);

  return (
    <Card className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <h2 className="text-lg font-semibold text-slate-800">
          <i className="ri-route-line mr-2"></i>
          Ruta en Construcción
        </h2>
        <Badge variant="warning">{pedidosSeleccionados.length} paradas</Badge>
      </div>

      {pedidosSeleccionados.length > 0 && (
        <div className="bg-slate-50 rounded-lg p-3 mb-4 flex-shrink-0">
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

      <div className="overflow-y-auto flex-1 min-h-0">
        {pedidosSeleccionados.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <i className="ri-route-line text-4xl mb-2"></i>
            <p>Selecciona pedidos para armar la ruta</p>
            <p className="text-xs mt-1">Los pedidos aparecerán aquí</p>
          </div>
        ) : (
          pedidosSeleccionados.map((pedido, index) => (
            <ParadaCard
              key={pedido.id}
              pedido={pedido}
              isLast={index === pedidosSeleccionados.length - 1}
              isDragging={draggedIndex === index}
              onQuitar={onQuitarPedido}
              onDragStart={() => setDraggedIndex(index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragEnd={() => setDraggedIndex(null)}
              onEnfocar={setParadaEnfocadaId}
            />
          ))
        )}
      </div>

      {pedidosSeleccionados.length > 0 && (
        <div className="mt-4 flex-shrink-0">
          <RutaMapaPreview pedidos={pedidosSeleccionados} paradaEnfocadaId={paradaEnfocadaId} />
        </div>
      )}

      {pedidosSeleccionados.length > 0 && (
        <div className="mt-4 p-3 bg-teal-50 border border-teal-200 rounded-lg flex-shrink-0">
          <div className="flex items-start gap-2 text-sm text-teal-800">
            <i className="ri-magic-line mt-0.5"></i>
            <p>Usa <strong>Optimizar paradas</strong> para calcular la secuencia de entrega más eficiente, o arrastra para reordenar manualmente.</p>
          </div>
        </div>
      )}
    </Card>
  );
}
