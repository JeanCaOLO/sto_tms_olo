import { usePlanAutomatico } from '../use-plan-automatico';
import { useZonasNombre } from '../use-zonas-nombre';
import ViajePropuestoCard from './ViajePropuestoCard';
import type { Conductor, Vehiculo } from '../types';

interface Props {
  vehiculos: Vehiculo[];
  conductores: Conductor[];
}

function formatoFecha(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString('es-CR', { weekday: 'long', day: 'numeric', month: 'long' });
}

// Flujo automático: los pedidos con entrega para mañana se agrupan por destino
// y se reparten entre la flota por capacidad al pulsar "Planificar". No hay
// armado manual de viajes.
export default function PlanAutomatico({ vehiculos, conductores }: Props) {
  const { fecha, pedidos, cargando, resultado, planificando, planificar, recargar } =
    usePlanAutomatico({ vehiculos, conductores });
  const { nombreDe } = useZonasNombre();

  if (cargando) {
    return (
      <div className="flex items-center justify-center h-48 text-slate-500">
        <i className="ri-loader-4-line animate-spin text-2xl"></i>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">Entregas a planificar para</p>
          <p className="text-base font-bold text-slate-800 capitalize">{formatoFecha(fecha)}</p>
          <p className="text-xs text-slate-500 mt-1">
            <strong>{pedidos.length}</strong> pedidos · <strong>{vehiculos.length}</strong> vehículos disponibles
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={recargar}
            className="px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
          >
            <i className="ri-refresh-line mr-1"></i>Recargar
          </button>
          <button
            onClick={planificar}
            disabled={planificando || pedidos.length === 0}
            className="px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:bg-teal-300 text-white text-sm font-semibold rounded-lg cursor-pointer flex items-center gap-2"
          >
            <i className={planificando ? 'ri-loader-4-line animate-spin' : 'ri-route-line'}></i>
            {planificando ? 'Planificando...' : 'Planificar entregas'}
          </button>
        </div>
      </div>

      {pedidos.length === 0 && (
        <p className="text-center text-sm text-slate-400 py-10">
          No hay pedidos con entrega para mañana.
        </p>
      )}

      {resultado && (
        <>
          {resultado.viajes.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {resultado.viajes.map((v, i) => (
                <ViajePropuestoCard key={`${v.destino}-${v.slot.vehiculo.id}`} viaje={v} indice={i} destinoNombre={nombreDe(v.destino)} />
              ))}
            </div>
          )}
          {resultado.sinAsignar.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <p className="text-sm font-semibold text-amber-800 flex items-center gap-2">
                <i className="ri-alert-line"></i>
                {resultado.sinAsignar.length} pedido(s) sin asignar
              </p>
              <p className="text-xs text-amber-700 mt-1">
                No alcanzó la capacidad de la flota disponible en su destino. Agregá más vehículos o movelos a otro día.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
