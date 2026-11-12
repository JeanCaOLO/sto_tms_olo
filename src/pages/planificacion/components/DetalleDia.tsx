import { useTranslation } from 'react-i18next';
import { useZonasNombre } from '../use-zonas-nombre';
import PlanTripCard from './PlanTripCard';
import { viajesDeCelda, viajesDeFecha } from '../calendario';
import type { RoutePlan } from '../planes-types';

interface Props {
  planes: RoutePlan[];
  fechaISO: string;
  // Si viene, filtra a una sola zona (al abrir una celda de la matriz). Si no,
  // muestra todos los viajes del día (al abrir un día del mes / vista Día).
  zonaCodigo?: string | null;
  onRecargar?: () => void | Promise<void>;
}

// Detalle de un día: los viajes (reusa PlanTripCard → mapa + secuencia de
// paradas + pedidos + artículos, en modo solo lectura). Se usa inline en la
// vista Día y dentro del modal al abrir una celda/día de semana/mes.
export default function DetalleDia({ planes, fechaISO, zonaCodigo, onRecargar }: Props) {
  const { t } = useTranslation();
  const { nombreDe } = useZonasNombre();
  const viajes = zonaCodigo ? viajesDeCelda(planes, fechaISO, zonaCodigo) : viajesDeFecha(planes, fechaISO);

  if (viajes.length === 0) {
    return (
      <div className="py-12 flex flex-col items-center gap-2 text-slate-400">
        <i className="ri-calendar-close-line text-3xl"></i>
        <p className="text-sm">{t('planning.noTrips')}</p>
      </div>
    );
  }

  // Un solo viaje → centrado y con ancho cómodo (no estirado ni flaco a la
  // izquierda). Varios → grilla que se auto-acomoda: cada card ≥320px, se ponen
  // lado a lado si hay espacio y hacen wrap si no (el modal scrollea en vertical).
  const layout =
    viajes.length === 1
      ? 'max-w-md mx-auto'
      : 'grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(320px,1fr))]';

  return (
    <div className={layout}>
      {viajes.map((trip, i) => (
        <PlanTripCard
          key={trip.id}
          trip={trip}
          indice={i}
          zonaNombre={nombreDe(trip.delivery_zone)}
          editable={false}
          destinos={[]}
          onMover={() => {}}
          onViajeActualizado={onRecargar}
        />
      ))}
    </div>
  );
}
