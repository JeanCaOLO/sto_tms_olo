import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import CapacityBar from './CapacityBar';
import TripMapa, { type ParadaMapa } from './TripMapa';
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

// Tarjeta de una ruta: zona (identidad), vehículo, mapa (OSRM), barras de
// capacidad y la secuencia de paradas. Las coords salen directo de la parada
// (stop.delivery_latitude/longitude, que el backend embebe), así el mismo
// componente sirve en PlanEditor y en PlanesTab sin depender de pedidos cargados.
// En draft, cada parada se puede mover a otra ruta.
export default function PlanTripCard({ trip, indice, zonaNombre, editable, destinos, onMover }: Props) {
  const { t } = useTranslation();
  const titulo = zonaNombre || trip.delivery_zone;
  const mostrarCodigo = zonaNombre && zonaNombre !== trip.delivery_zone;
  const hayPeso = trip.total_weight != null;
  const hayVolumen = trip.total_volume != null;

  // Paradas ubicadas para el mapa (solo las que tienen coordenadas).
  const paradasMapa = useMemo<ParadaMapa[]>(
    () =>
      trip.stops
        .filter((s) => typeof s.delivery_latitude === 'number' && typeof s.delivery_longitude === 'number')
        .map((s) => ({
          id: s.order_id,
          delivery_latitude: s.delivery_latitude as number,
          delivery_longitude: s.delivery_longitude as number,
          stop_number: s.stop_order,
        })),
    [trip.stops],
  );

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col">
      <div className="p-4 pb-3 border-b border-slate-100">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-teal-600 uppercase tracking-wide flex items-center gap-1">
              <i className="ri-route-line"></i>
              {t('planning.routeWord')} {indice + 1}
            </p>
            <h3 className="text-base font-bold text-slate-800 truncate">{titulo}</h3>
            {mostrarCodigo && (
              <p className="text-[10px] text-slate-400 font-mono">{t('planning.zoneCode')} {trip.delivery_zone}</p>
            )}
            <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
              <i className="ri-truck-line"></i>
              <span className="truncate">{trip.vehicle_plate} · {trip.vehicle_label}</span>
              {trip.is_flota_propia && (
                <span className="shrink-0 text-teal-600 font-medium">· {t('planning.ownFleet')}</span>
              )}
            </p>
          </div>
          <span className="text-xs bg-teal-50 text-teal-700 font-semibold px-2.5 py-1 rounded-full shrink-0">
            {trip.stops.length} {trip.stops.length === 1 ? t('planning.stopWord') : t('planning.stopsWord')}
          </span>
        </div>

        {(hayPeso || hayVolumen) && (
          <div className="space-y-2 mt-3">
            {hayPeso && (
              <CapacityBar icon="ri-scales-3-line" label={t('planning.weight')} value={trip.total_weight as number}
                max={trip.vehicle_capacity_weight} unit="kg" />
            )}
            {hayVolumen && (
              <CapacityBar icon="ri-box-3-line" label={t('planning.volume')} value={trip.total_volume as number}
                max={trip.vehicle_capacity_volume} unit="m³" decimals={2} />
            )}
          </div>
        )}
      </div>

      {/* Mapa de la ruta por calles (OSRM) con las paradas numeradas. */}
      <div className="p-3">
        <TripMapa paradas={paradasMapa} />
      </div>

      <ol className="px-4 pb-4 space-y-1.5">
        {trip.stops.map((s) => {
          const nombre = s.customer_name || s.order_number || s.order_id.slice(0, 8);
          return (
            <li key={s.id || s.order_id} className="flex items-center gap-2 text-xs text-slate-600">
              <span className="w-5 h-5 flex items-center justify-center bg-teal-50 text-teal-700 rounded-full font-semibold shrink-0">
                {s.stop_order}
              </span>
              <span className="truncate flex-1">
                {nombre}
                {s.delivery_city && <span className="text-slate-400"> — {s.delivery_city}</span>}
              </span>
              {editable && destinos.length > 0 && (
                <select
                  aria-label={`Mover ${nombre}`}
                  className="text-[11px] border border-slate-200 rounded px-1 py-0.5 bg-white cursor-pointer shrink-0"
                  value=""
                  onChange={(e) => e.target.value && onMover(s.order_id, e.target.value)}
                >
                  <option value="">{t('planning.moveTo')}</option>
                  {destinos.map((d) => (
                    <option key={d.id} value={d.id}>{d.label}</option>
                  ))}
                </select>
              )}
            </li>
          );
        })}
        {trip.stops.length === 0 && (
          <li className="text-xs text-slate-400 italic py-1">{t('planning.noStops')}</li>
        )}
      </ol>
    </div>
  );
}
