import { useState } from 'react';
import Card from '../../../components/base/Card';
import Badge from '../../../components/base/Badge';
import ParadaCard from './ParadaCard';
import RutaMapaPreview from './RutaMapaPreview';
import DevolucionEnVivoForm from './DevolucionEnVivoForm';
import { entregasADescargarPara } from '../capacity-fit';
import type { DevolucionEnVivoInput } from '../live-devolucion';
import type { PedidoSeleccionado, Vehiculo } from '../types';

interface Props {
  pedidosSeleccionados: PedidoSeleccionado[];
  pedidosAnclados: Set<string>;
  vehiculoSeleccionado?: Vehiculo;
  optimizando: boolean;
  onQuitarPedido: (pedidoId: string) => void;
  onReordenarParadas: (fromIndex: number, toIndex: number) => void;
  onAgregarDevolucionEnVivo: (input: DevolucionEnVivoInput) => void;
  onOptimizarRuta: () => void;
}

export default function RutaEnConstruccion({
  pedidosSeleccionados, pedidosAnclados, vehiculoSeleccionado, optimizando,
  onQuitarPedido, onReordenarParadas, onAgregarDevolucionEnVivo, onOptimizarRuta,
}: Props) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [paradaEnfocadaId, setParadaEnfocadaId] = useState<string>();
  const [mostrarForm, setMostrarForm] = useState(false);

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex !== null && draggedIndex !== index) {
      onReordenarParadas(draggedIndex, index);
      setDraggedIndex(index);
    }
  };

  const totalWeight = pedidosSeleccionados.reduce((sum, p) => sum + (p.total_weight || 0), 0);
  const totalVolume = pedidosSeleccionados.reduce((sum, p) => sum + (p.total_volume || 0), 0);
  const live = pedidosSeleccionados.filter((p) => p.is_live);
  const liveSinRecalcular = live.some((p) => p.eta_min == null);
  const entregasADescargar = vehiculoSeleccionado
    ? entregasADescargarPara(pedidosSeleccionados, vehiculoSeleccionado, pedidosAnclados)
    : [];

  return (
    <Card className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-4 flex-shrink-0 gap-2">
        <h2 className="text-lg font-semibold text-slate-800">
          <i className="ri-route-line mr-2"></i>
          Ruta en Construcción
        </h2>
        <div className="flex items-center gap-2">
          <Badge variant="warning">{pedidosSeleccionados.length} paradas</Badge>
          <button
            onClick={() => setMostrarForm((v) => !v)}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 cursor-pointer whitespace-nowrap"
          >
            <i className="ri-truck-line"></i>Devolución en vivo
          </button>
        </div>
      </div>

      {mostrarForm && (
        <div className="flex-shrink-0">
          <DevolucionEnVivoForm
            onAgregar={(input) => { onAgregarDevolucionEnVivo(input); setMostrarForm(false); }}
            onCancelar={() => setMostrarForm(false)}
          />
        </div>
      )}

      {live.length > 0 && (
        <div role="alert" className="flex-shrink-0 mb-3 rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-2 text-sm text-indigo-900">
          <p className="flex items-center gap-1.5 font-medium">
            <i className="ri-alert-line"></i>
            {live.length} devolución/es en vivo en la secuencia — carga entrante {live.reduce((s, p) => s + (p.total_weight || 0), 0).toFixed(1)} kg.
          </p>
          {entregasADescargar.length > 0 && (
            <p className="mt-1">
              No cabe con la carga actual. Descarga antes de recoger:{' '}
              <strong>{entregasADescargar.map((p) => p.order_number).join(', ')}</strong>.
            </p>
          )}
          {liveSinRecalcular && (
            <button
              onClick={onOptimizarRuta}
              disabled={optimizando}
              className="mt-2 flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 cursor-pointer disabled:opacity-60"
            >
              <i className={optimizando ? 'ri-loader-4-line animate-spin' : 'ri-refresh-line'}></i>
              Recalcular secuencia y carga
            </button>
          )}
        </div>
      )}

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
    </Card>
  );
}
