// Encabezado de Liquidaciones: título, "ver como" y el interruptor de vista extendida (solo quien configura).

import ViewAsToggle from '../../../components/feature/ViewAsToggle';
import { InterruptorVista } from '../components/InterruptorVista';

interface Props {
  puedeConfigurar: boolean;
  extendida: boolean;
  onChange: (extendida: boolean) => void;
}

export function PageHeader({ puedeConfigurar, extendida, onChange }: Props) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold text-slate-800">Liquidaciones</h1>
        <p className="text-sm text-slate-500 mt-1">
          Cuánto se le paga a cada transportista por cada viaje completado, y por qué.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <ViewAsToggle />
        {puedeConfigurar && <InterruptorVista extendida={extendida} onChange={onChange} />}
      </div>
    </div>
  );
}
