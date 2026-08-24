import Card from '../../../components/base/Card';
import Badge from '../../../components/base/Badge';
import StopMiniPreview from './StopMiniPreview';
import RutaMapaPreview from './RutaMapaPreview';
import { estadoDeRuta } from '../route-status';
import type { RutaGenerada } from '../generar-ruta-mock';
import type { Conductor, RutaTipo, Transportista, Vehiculo } from '../types';

interface Props {
  ruta: RutaGenerada;
  rutasTipo: RutaTipo[];
  transportistas: Transportista[];
  conductores: Conductor[];
  vehiculos: Vehiculo[];
  onEliminar: (id: string) => void;
  onEditar: (ruta: RutaGenerada) => void;
}

const creadaHace = (isoDate: string): string => {
  const minutos = Math.round((Date.now() - new Date(isoDate).getTime()) / 60000);
  if (minutos < 1) return 'recién';
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.round(horas / 24);
  return `hace ${dias} d`;
};

const nombreDe = <T extends { id: string; name?: string; full_name?: string; plate?: string }>(
  lista: T[],
  id: string,
): string => {
  const item = lista.find((x) => x.id === id);
  return item?.name || item?.full_name || item?.plate || 'Desconocido';
};

export default function RutaGeneradaCard({ ruta, rutasTipo, transportistas, conductores, vehiculos, onEliminar, onEditar }: Props) {
  const estado = estadoDeRuta(ruta.fechaRuta);

  return (
    <Card className="flex flex-col">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="font-semibold text-slate-800">{ruta.routeNumber}</p>
          <p className="text-xs text-slate-500 mt-0.5">{nombreDe(rutasTipo, ruta.rutaTypeId)}</p>
          <p className="text-xs text-slate-400 mt-0.5">
            <i className="ri-time-line mr-1"></i>Creada {creadaHace(ruta.createdAt)}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Badge variant={estado.variant} size="sm">{estado.label}</Badge>
          <button
            onClick={() => onEditar(ruta)}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-teal-600 hover:bg-teal-50 transition-colors cursor-pointer"
            title="Editar ruta"
          >
            <i className="ri-pencil-line"></i>
          </button>
          <button
            onClick={() => onEliminar(ruta.id)}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
            title="Eliminar ruta"
          >
            <i className="ri-delete-bin-line"></i>
          </button>
        </div>
      </div>

      <div className="space-y-1.5 text-sm text-slate-600">
        <div className="flex items-center gap-2"><i className="ri-building-line text-slate-400"></i>{nombreDe(transportistas, ruta.transportistaId)}</div>
        <div className="flex items-center gap-2"><i className="ri-user-line text-slate-400"></i>{nombreDe(conductores, ruta.conductorId)}</div>
        <div className="flex items-center gap-2"><i className="ri-truck-line text-slate-400"></i>{nombreDe(vehiculos, ruta.vehiculoId)}</div>
        <div className="flex items-center gap-2"><i className="ri-calendar-line text-slate-400"></i>{ruta.fechaRuta}</div>
      </div>

      <div className="border-t border-slate-100 mt-3 pt-3">
        <RutaMapaPreview pedidos={ruta.pedidos} />
      </div>

      <div className="border-t border-slate-100 mt-3 pt-3 flex-1">
        <p className="text-xs font-semibold text-slate-500 mb-2">Secuencia de paradas</p>
        <StopMiniPreview pedidos={ruta.pedidos} />
      </div>

      <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100">
        <Badge variant="info">{ruta.pedidos.length} paradas</Badge>
        <span className="text-xs text-slate-500">{ruta.totalWeight.toFixed(1)} kg · {ruta.totalVolume.toFixed(1)} m³</span>
      </div>
    </Card>
  );
}
