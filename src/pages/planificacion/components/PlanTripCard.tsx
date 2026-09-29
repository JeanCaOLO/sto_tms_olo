import CapacityBar from './CapacityBar';
import type { PlanTrip } from '../planes-types';

interface Props {
  trip: PlanTrip;
  indice: number;
  zonaNombre?: string;
  editable: boolean;
  // Otros viajes a los que se puede mover un pedido (id + etiqueta).
  destinos: { id: string; label: string }[];
  onMover: (orderId: string, toTripId: string) => void;
}

// Tarjeta de un viaje persistido: vehículo, barras de capacidad (solo si hay
// dato real), y la secuencia de paradas. En draft, cada parada ofrece un select
// para moverla a otro viaje (PUT). Fuera de draft es de solo lectura.
export default function PlanTripCard({ trip, indice, zonaNombre, editable, destinos, onMover }: Props) {
  const titulo = zonaNombre || trip.delivery_zone;
  const mostrarCodigo = zonaNombre && zonaNombre !== trip.delivery_zone;
  const hayPeso = trip.total_weight != null;
  const hayVolumen = trip.total_volume != null;

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="text-xs font-semibold text-teal-600 uppercase tracking-wide">Viaje {indice + 1}</p>
          <h3 className="text-sm font-bold text-slate-800">{titulo}</h3>
          {mostrarCodigo && <p className="text-[10px] text-slate-400 font-mono">Ruta {trip.delivery_zone}</p>}
          <p className="text-xs text-slate-500 mt-0.5">
            {trip.vehicle_plate} · {trip.vehicle_label}
            {trip.is_flota_propia && <span className="ml-1 text-teal-600 font-medium">(flota propia)</span>}
          </p>
        </div>
        <span className="text-xs bg-teal-50 text-teal-700 font-medium px-2 py-1 rounded-full shrink-0">
          {trip.stops.length} {trip.stops.length === 1 ? 'parada' : 'paradas'}
        </span>
      </div>

      {(hayPeso || hayVolumen) && (
        <div className="space-y-2 mb-3">
          {hayPeso && (
            <CapacityBar icon="ri-scales-3-line" label="Peso" value={trip.total_weight as number}
              max={trip.vehicle_capacity_weight} unit="kg" />
          )}
          {hayVolumen && (
            <CapacityBar icon="ri-box-3-line" label="Volumen" value={trip.total_volume as number}
              max={trip.vehicle_capacity_volume} unit="m³" decimals={2} />
          )}
        </div>
      )}

      <ol className="space-y-1.5">
        {trip.stops.map((s) => (
          <li key={s.id} className="flex items-center gap-2 text-xs text-slate-600">
            <span className="w-5 h-5 flex items-center justify-center bg-teal-50 text-teal-700 rounded-full font-semibold shrink-0">
              {s.stop_order}
            </span>
            <span className="truncate flex-1">
              {s.customer_name || s.order_number}
              {s.delivery_city && ` — ${s.delivery_city}`}
            </span>
            {editable && destinos.length > 0 && (
              <select
                aria-label={`Mover ${s.order_number} a otro viaje`}
                className="text-[11px] border border-slate-200 rounded px-1 py-0.5 bg-white cursor-pointer shrink-0"
                value=""
                onChange={(e) => e.target.value && onMover(s.order_id, e.target.value)}
              >
                <option value="">Mover a…</option>
                {destinos.map((d) => (
                  <option key={d.id} value={d.id}>{d.label}</option>
                ))}
              </select>
            )}
          </li>
        ))}
        {trip.stops.length === 0 && (
          <li className="text-xs text-slate-400 italic py-1">Sin paradas</li>
        )}
      </ol>
    </div>
  );
}
