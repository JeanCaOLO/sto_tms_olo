import { useSearchParams } from 'react-router-dom';
import CompaniasView from '../CompaniasView';

// Costos Flota: flota propia y flota externa en una sola pantalla del módulo de Tarifas. Son la misma
// entidad con dos clasificaciones; la pestaña activa vive en la URL (`?flota=`) para poder compartirla.
const FLOTAS = [
  { id: 'propia', label: 'Flota Propia', icon: 'ri-home-gear-line', classification: 'OWN' },
  { id: 'externa', label: 'Flota Externa', icon: 'ri-truck-line', classification: 'OUTSOURCED' },
] as const;

export default function CostosFlotaPage() {
  const [params, setParams] = useSearchParams();
  const active = FLOTAS.find((f) => f.id === params.get('flota')) ?? FLOTAS[0];

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Tipo de flota" className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {FLOTAS.map((flota) => (
          <button
            key={flota.id}
            type="button"
            role="tab"
            aria-selected={flota.id === active.id}
            onClick={() => setParams({ flota: flota.id }, { replace: true })}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md whitespace-nowrap cursor-pointer transition-colors ${
              flota.id === active.id ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <i className={flota.icon} />
            {flota.label}
          </button>
        ))}
      </div>
      <CompaniasView key={active.id} classification={active.classification} />
    </div>
  );
}
