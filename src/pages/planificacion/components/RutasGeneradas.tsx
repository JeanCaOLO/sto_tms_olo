import Card from '../../../components/base/Card';
import RutaGeneradaCard from './RutaGeneradaCard';
import type { RutaGenerada } from '../generar-ruta-mock';
import type { Conductor, RutaTipo, Transportista, Vehiculo } from '../types';

interface Props {
  rutas: RutaGenerada[];
  rutasTipo: RutaTipo[];
  transportistas: Transportista[];
  conductores: Conductor[];
  vehiculos: Vehiculo[];
  onEliminar: (id: string) => void;
  onEditar: (ruta: RutaGenerada) => void;
}

export default function RutasGeneradas({ rutas, rutasTipo, transportistas, conductores, vehiculos, onEliminar, onEditar }: Props) {
  if (rutas.length === 0) {
    return (
      <Card>
        <div className="flex flex-col items-center justify-center py-16 text-slate-400">
          <div className="w-16 h-16 flex items-center justify-center rounded-full bg-slate-50">
            <i className="ri-route-line text-4xl"></i>
          </div>
          <p className="mt-4 font-medium text-slate-500">Todavía no has generado ninguna ruta</p>
          <p className="text-sm mt-1 text-center">Las rutas que generes en la pestaña "Nueva Ruta" van a aparecer aquí</p>
        </div>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {rutas.map((ruta) => (
        <RutaGeneradaCard
          key={ruta.id}
          ruta={ruta}
          rutasTipo={rutasTipo}
          transportistas={transportistas}
          conductores={conductores}
          vehiculos={vehiculos}
          onEliminar={onEliminar}
          onEditar={onEditar}
        />
      ))}
    </div>
  );
}
