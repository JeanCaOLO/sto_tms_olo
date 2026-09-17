import Button from '../../../components/base/Button';
import { totalesPedidos } from '../asignar-viajes-helpers';
import type { Pedido } from '../types';
import type { ViajeMock } from '../viaje-asignacion-mock';

interface Props {
  viaje: ViajeMock;
  pedidos: Pedido[]; // ya resueltos del pool
  seleccionCount: number;
  onAsignar: (viajeId: string) => void;
  onQuitarPedido: (viajeId: string, pedidoId: string) => void;
  onEliminar: (viajeId: string) => void;
}

export default function ViajeAsignacionCard({ viaje, pedidos, seleccionCount, onAsignar, onQuitarPedido, onEliminar }: Props) {
  const { peso, volumen } = totalesPedidos(pedidos);

  return (
    <div className="border border-slate-200 rounded-lg p-4 bg-white">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-slate-800">
            <i className="ri-truck-line mr-1.5 text-teal-600"></i>{viaje.numero}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">{viaje.rutaNombre || viaje.rutaTypeId} · {viaje.fecha}</p>
        </div>
        <button
          onClick={() => onEliminar(viaje.id)}
          className="text-slate-400 hover:text-red-600 cursor-pointer"
          title="Eliminar viaje"
        >
          <i className="ri-delete-bin-line"></i>
        </button>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-slate-600">
        <span><i className="ri-box-3-line mr-1 text-slate-400"></i>{pedidos.length} pedidos</span>
        <span><i className="ri-scales-3-line mr-1 text-slate-400"></i>{peso.toFixed(1)} kg</span>
        <span><i className="ri-archive-line mr-1 text-slate-400"></i>{volumen.toFixed(2)} m³</span>
      </div>

      <Button
        variant="secondary"
        className="w-full mt-3 text-sm"
        onClick={() => onAsignar(viaje.id)}
        disabled={seleccionCount === 0}
      >
        <i className="ri-add-line mr-1"></i>
        {seleccionCount > 0 ? `Asignar ${seleccionCount} seleccionado(s)` : 'Selecciona pedidos para asignar'}
      </Button>

      {pedidos.length > 0 && (
        <ul className="mt-3 space-y-1 max-h-48 overflow-auto">
          {pedidos.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 text-xs bg-slate-50 rounded px-2 py-1">
              <span className="truncate">
                <span className="font-mono">{p.order_number}</span>
                <span className="text-slate-400"> · </span>
                <span className="text-slate-600">{p.customer_name || p.customer_id}</span>
              </span>
              <button
                onClick={() => onQuitarPedido(viaje.id, p.id)}
                className="text-slate-400 hover:text-red-600 cursor-pointer flex-shrink-0"
                title="Quitar del viaje"
              >
                <i className="ri-close-line"></i>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
