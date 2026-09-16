import PaisSelector from './PaisSelector';
import CompaniaSelector from './CompaniaSelector';
import type { Compania, Pais } from '../eflow-api';

interface Props {
  pais: Pais;
  onPais: (p: Pais) => void;
  companias: Compania[];
  company: string;
  onCompania: (id: string) => void;
  // Contador de pedidos incluidos (solo en la pestaña "Nueva"); null = oculto.
  resumen: { incluidos: number; total: number } | null;
}

export default function PlanificacionHeader({ pais, onPais, companias, company, onCompania, resumen }: Props) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div>
        <h1 className="text-xl lg:text-2xl font-bold text-slate-800">Planificación de Rutas</h1>
        <p className="text-sm text-slate-500 mt-1">
          Selecciona un viaje despachado, asigna transportista, conductor y vehículo, y genera la ruta óptima de entrega
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3 flex-shrink-0">
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
