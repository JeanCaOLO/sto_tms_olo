import { useTranslation } from 'react-i18next';
import Badge from '../../../components/base/Badge';
import type { Viaje } from '../types';
import { COLOR_HEX, STATE_KEY, formatAge, formatDay, stateVariant } from '../tracking-logic';
import AlertDots from './AlertDots';
import ProgressBar from './ProgressBar';

interface Props {
  viaje: Viaje;
  selected: boolean;
  now: number;
  onSelect: (id: string) => void;
}

/** Tarjeta de la lista lateral: viaje, conductor · placa, avance y última señal. Al elegirla se abre el detalle. */
export default function ViajeCard({ viaje, selected, now, onSelect }: Props) {
  const { t } = useTranslation();
  const age = viaje.state === 'active' ? formatAge(viaje.position?.recorded_at, now, t) : null;
  const due = formatDay(viaje.due_date);
  const assigned = formatDay(viaje.assigned_at, viaje.timezone);
  return (
    <button
      type="button"
      onClick={() => onSelect(viaje.id)}
      aria-pressed={selected}
      className={`w-full text-left rounded-lg border p-3 transition-colors cursor-pointer ${selected ? 'border-teal-500 bg-teal-50/40' : 'border-slate-200 bg-white hover:border-slate-300'}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 min-w-0">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: COLOR_HEX[viaje.color] }} aria-hidden />
          <span className="font-semibold text-slate-900 text-sm truncate">{viaje.route_number}</span>
        </span>
        <Badge size="sm" variant={stateVariant(viaje.state, viaje.signal)}>
          {viaje.phase === 'por_salir' ? t('tracking.phaseDeparting') : t(STATE_KEY[viaje.state])}
        </Badge>
      </div>
      <p className="mt-1 text-xs text-slate-600 truncate">
        {viaje.driver_name ?? t('tracking.noDriver')} · {viaje.plate ?? t('tracking.noVehicle')}
      </p>
      {(assigned || due) && (
        <p className="text-xs text-slate-500 truncate">
          {assigned && `${t('tracking.assigned')} ${assigned}`}{assigned && due ? ' · ' : ''}{due && `${t('tracking.dueDate')} ${due}`}
        </p>
      )}
      {viaje.alerts.length > 0 && <div className="mt-2"><AlertDots alerts={viaje.alerts} /></div>}
      <div className="mt-2">
        <ProgressBar percent={viaje.progress.percent} failed={viaje.progress.failed} total={viaje.progress.total} />
        <p className="mt-1 text-xs text-slate-500 flex justify-between gap-2">
          <span>{viaje.progress.total ? t('tracking.progress', { done: viaje.progress.done, total: viaje.progress.total }) : t('tracking.noStops')}</span>
          {age && <span>{t('tracking.lastSeen', { age })}</span>}
        </p>
      </div>
    </button>
  );
}
