import StopBadge from './StopBadge';
import type { PedidoSeleccionado } from '../types';

const VISIBLE_STOPS = 3;

interface Props {
  pedidos: PedidoSeleccionado[];
}

export default function StopMiniPreview({ pedidos }: Props) {
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
        <p className="text-xs text-slate-400 pl-8">+{restantes} {restantes === 1 ? 'parada más' : 'paradas más'}</p>
      )}
    </div>
  );
}
