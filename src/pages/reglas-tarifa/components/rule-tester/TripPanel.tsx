import Select from '../../../../components/base/Select';
import { describeTrip } from '../../../../lib/tarifas/tripContext';
import type { TripRecord } from '../../../../lib/tarifas/types';

function Dato({ label, valor }: { label: string; valor: string }) {
  return (
    <div>
      <span className="block text-slate-400">{label}</span>
      <span className="text-slate-700 font-medium">{valor}</span>
    </div>
  );
}

interface Props {
  tripId: string;
  trips: TripRecord[];
  trip: TripRecord | null;
  loadingTrips: boolean;
  viajePartyId: string | null;
  calculando: boolean;
  onTripChange: (id: string) => void;
}

/** Modo "desde un viaje": se elige un viaje completado y se muestran los datos que aporta. */
export default function TripPanel({ tripId, trips, trip, loadingTrips, viajePartyId, calculando, onTripChange }: Props) {
  return (
    <>
      <Select
        label="Viaje completado *"
        value={tripId}
        onChange={(e) => onTripChange(e.target.value)}
        options={[
          {
            value: '',
            label: loadingTrips
              ? 'Cargando viajes…'
              : trips.length === 0 ? 'No hay viajes completados en este país' : 'Elegir viaje…',
          },
          ...trips.map((t) => ({
            value: t.id,
            label: `${t.routeNumber} · ${t.routeDate} · ${t.carrierName ?? 'sin transportista'}`,
          })),
        ]}
      />

      {trip && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
          <p className="text-[11px] text-slate-500 uppercase font-medium mb-2">
            Del viaje {trip.routeNumber}
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-y-2 gap-x-4 text-xs">
            {describeTrip(trip).map((d) => <Dato key={d.label} label={d.label} valor={d.value} />)}
          </div>
          {trip.carrierId && !viajePartyId && !calculando && (
            <p className="text-[11px] text-slate-500 mt-2">
              El transportista no tiene perfil de cálculo: se prueba solo con las reglas del país.
            </p>
          )}
        </div>
      )}
    </>
  );
}
