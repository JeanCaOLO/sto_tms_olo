import { useState } from 'react';
import StopBadge from './StopBadge';
import SecuenciaRutaModal from './SecuenciaRutaModal';
import type { PedidoSeleccionado } from '../types';

const VISIBLE_STOPS = 3;

interface Props {
  pedidos: PedidoSeleccionado[];
}

export default function StopMiniPreview({ pedidos }: Props) {
  const [mostrarSecuencia, setMostrarSecuencia] = useState(false);
  const visibles = pedidos.slice(0, VISIBLE_STOPS);
  const restantes = pedidos.length - visibles.length;

  return (
    <div className="space-y-1.5">
      {visibles.map((pedido) => (
        <div key={pedido.id} className="flex items-center gap-2 text-xs text-slate-600">
          <StopBadge number={pedido.stop_number} size="sm" muted />
          <span className="truncate">{pedido.delivery_zone || pedido.delivery_city}</span>
        </div>
      ))}
      {restantes > 0 && (
        <button
          onClick={() => setMostrarSecuencia(true)}
          className="text-xs text-teal-600 hover:text-teal-700 hover:underline pl-8 cursor-pointer"
        >
          +{restantes} {restantes === 1 ? 'parada más' : 'paradas más'}
        </button>
      )}
      {mostrarSecuencia && <SecuenciaRutaModal pedidos={pedidos} onClose={() => setMostrarSecuencia(false)} />}
    </div>
  );
}
