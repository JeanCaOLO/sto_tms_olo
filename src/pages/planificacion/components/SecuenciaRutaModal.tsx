import RutaMapaPreview from './RutaMapaPreview';
import StopBadge from './StopBadge';
import type { PedidoSeleccionado } from '../types';

interface Props {
  pedidos: PedidoSeleccionado[];
  onClose: () => void;
}

export default function SecuenciaRutaModal({ pedidos, onClose }: Props) {
  const ordenados = [...pedidos].sort((a, b) => a.stop_number - b.stop_number);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[2000] p-4">
      <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-800">Secuencia de paradas ({ordenados.length})</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 w-8 h-8 flex items-center justify-center cursor-pointer">
            <i className="ri-close-line text-xl"></i>
          </button>
        </div>

        <div className="p-6 space-y-4">
          <RutaMapaPreview pedidos={ordenados} alturaClase="h-[420px]" />
          <div className="space-y-1.5">
            {ordenados.map((p) => (
              <div key={p.id} className="flex items-center gap-2 text-sm text-slate-600 border border-slate-100 rounded-lg px-3 py-2">
                <StopBadge number={p.stop_number} size="sm" />
                <span className="font-medium text-slate-700">{p.order_number}</span>
                <span className="truncate text-slate-500">— {p.delivery_zone || p.delivery_city}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
