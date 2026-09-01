import { useEffect } from 'react';
import type { PedidoSeleccionado } from '../types';

interface Props {
  titulo: string;
  pedidos: PedidoSeleccionado[];
  onClose: () => void;
}

// Modal de solo lectura: lista los pedidos asignados a un conductor en el reparto.
// Sigue el patrón del módulo (backdrop, panel blanco, header sticky) + Escape y aria.
export default function PedidosAsignadosModal({ titulo, pedidos, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const ordenados = [...pedidos].sort((a, b) => a.stop_number - b.stop_number);

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[2000] p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pedidos-asignados-titulo"
        className="bg-white rounded-lg w-full max-w-md max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-slate-100 px-5 py-4 flex items-center justify-between">
          <h2 id="pedidos-asignados-titulo" className="font-semibold text-slate-800">
            {titulo} <span className="text-slate-400 font-normal">· {ordenados.length} pedidos</span>
          </h2>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            autoFocus
            className="text-slate-400 hover:text-slate-600 w-8 h-8 flex items-center justify-center cursor-pointer"
          >
            <i className="ri-close-line text-xl"></i>
          </button>
        </div>

        <ul className="p-2 overflow-y-auto divide-y divide-slate-100">
          {ordenados.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span className="w-6 h-6 shrink-0 flex items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-500 tabular-nums">
                {p.stop_number}
              </span>
              <span className="font-mono text-slate-700">{p.order_number}</span>
              <span className="truncate text-slate-400 ml-auto">{p.delivery_zone || p.delivery_city}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
