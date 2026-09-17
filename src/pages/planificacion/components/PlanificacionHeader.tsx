import PaisSelector from './PaisSelector';
import CompaniaSelector from './CompaniaSelector';
import type { Compania, Pais } from '../eflow-api';

interface Props {
  pais: Pais;
  onPais: (p: Pais) => void;
  companias: Compania[];
  company: string;
  onCompania: (id: string) => void;
  demo: boolean;
  onDemo: (v: boolean) => void;
  // Contador de pedidos incluidos (solo en la pestaña "Nueva"); null = oculto.
  resumen: { incluidos: number; total: number } | null;
}

export default function PlanificacionHeader({ pais, onPais, companias, company, onCompania, demo, onDemo, resumen }: Props) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div>
        <h1 className="text-xl lg:text-2xl font-bold text-slate-800">Planificación de Rutas</h1>
        <p className="text-sm text-slate-500 mt-1">
          Selecciona un viaje despachado, asigna transportista, conductor y vehículo, y genera la ruta óptima de entrega
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3 flex-shrink-0">
        <button
          type="button"
          role="switch"
          aria-checked={demo}
          onClick={() => onDemo(!demo)}
          title="Modo demo: datos de prueba perfectos para presentación (no leídos de EFLOW)"
          className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer ${
            demo ? 'border-amber-300 bg-amber-100 text-amber-800' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
          }`}
        >
          <i className={demo ? 'ri-flask-fill text-amber-600' : 'ri-flask-line'}></i>
          Demo {demo ? 'ON' : 'OFF'}
        </button>
        <PaisSelector pais={pais} onChange={onPais} />
        <CompaniaSelector companias={companias} value={company} onChange={onCompania} />
        {resumen && (
          <div className="flex items-center gap-2 text-sm bg-teal-50 border border-teal-200 text-teal-700 px-3 py-2 rounded-lg">
            <i className="ri-checkbox-circle-line"></i>
            <span><strong>{resumen.incluidos}</strong> de <strong>{resumen.total}</strong> pedidos incluidos</span>
          </div>
        )}
      </div>
    </div>
  );
}
