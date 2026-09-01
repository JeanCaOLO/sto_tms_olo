import { useState } from 'react';
import type { DevolucionEnVivoInput } from '../live-devolucion';

interface Props {
  onAgregar: (input: DevolucionEnVivoInput) => void;
  onCancelar: () => void;
}

// Alta de una devolución "al pie de camión". Mínimo indispensable: referencia
// del sitio/cliente + peso y volumen entrantes (cuentan en la capacidad). Sin
// coordenadas — el chofer ya está en el punto; queda al final de la secuencia
// y fuera del trazo del mapa.
export default function DevolucionEnVivoForm({ onAgregar, onCancelar }: Props) {
  const [ref, setRef] = useState('');
  const [peso, setPeso] = useState('');
  const [volumen, setVolumen] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ref.trim()) return;
    onAgregar({ ref: ref.trim(), peso: Number(peso) || 0, volumen: Number(volumen) || 0 });
    setRef(''); setPeso(''); setVolumen('');
  };

  return (
    <form onSubmit={submit} className="border border-indigo-200 bg-indigo-50 rounded-lg p-3 mb-3 space-y-2">
      <p className="text-xs font-semibold text-indigo-800 flex items-center gap-1">
        <i className="ri-truck-line"></i>Devolución en vivo (al pie de camión)
      </p>
      <div>
        <label htmlFor="live-ref" className="text-xs text-slate-600">Referencia / cliente</label>
        <input
          id="live-ref" type="text" value={ref} onChange={(e) => setRef(e.target.value)}
          required placeholder="Ej. Farmacia La Paz, contacto 8888-8888"
          className="w-full mt-0.5 px-2 py-1.5 text-sm border border-slate-200 rounded bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label htmlFor="live-peso" className="text-xs text-slate-600">Peso entrante (kg)</label>
          <input id="live-peso" type="number" min="0" step="0.01" value={peso} onChange={(e) => setPeso(e.target.value)}
            className="w-full mt-0.5 px-2 py-1.5 text-sm border border-slate-200 rounded bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <div>
          <label htmlFor="live-vol" className="text-xs text-slate-600">Volumen entrante (m³)</label>
          <input id="live-vol" type="number" min="0" step="0.01" value={volumen} onChange={(e) => setVolumen(e.target.value)}
            className="w-full mt-0.5 px-2 py-1.5 text-sm border border-slate-200 rounded bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <button type="submit" className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 cursor-pointer whitespace-nowrap">
          <i className="ri-add-line mr-1"></i>Agregar a la secuencia
        </button>
        <button type="button" onClick={onCancelar} className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-800 cursor-pointer">
          Cancelar
        </button>
      </div>
    </form>
  );
}
