import type { Pais } from '../eflow-api';

// Selector Costa Rica / Venezuela. Cambiar de país recarga viajes y catálogos
// desde el servidor EFLOW correspondiente (el país activo lo consume eflow-api).
const OPCIONES: { id: Pais; label: string; flag: string }[] = [
  { id: 'cr', label: 'Costa Rica', flag: '🇨🇷' },
  { id: 've', label: 'Venezuela', flag: '🇻🇪' },
];

export default function PaisSelector({ pais, onChange }: { pais: Pais; onChange: (p: Pais) => void }) {
  return (
    <div role="group" aria-label="País de datos" className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
      {OPCIONES.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={o.id === pais}
          onClick={() => onChange(o.id)}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer ${
            o.id === pais ? 'bg-teal-600 text-white' : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          <span aria-hidden="true">{o.flag}</span>
          {o.label}
        </button>
      ))}
    </div>
  );
}
