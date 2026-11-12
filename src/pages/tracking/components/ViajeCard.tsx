import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import Badge from '../../../components/base/Badge';
import type { Viaje } from '../types';
import { COLOR_HEX, STATE_KEY, driverLoggedOut, formatAge, formatDay, lastSignalAt, colorVariant } from '../tracking-logic';
import AlertDots from './AlertDots';
import ProgressBar from './ProgressBar';

interface Props {
  viaje: Viaje;
  selected: boolean;
  now: number;
  onSelect: (id: string) => void;
}

/** Tarjeta de la lista lateral: viaje, conductor · placa, avance y última señal. Al elegirla se abre el detalle. */
function ViajeCard({ viaje, selected, now, onSelect }: Props) {
  const { t } = useTranslation();
  const loggedOut = driverLoggedOut(viaje);
  // La última señal incluye el latido de la app: un chofer con la app abierta no figura "sin señal" por un GPS lento.
  const age = viaje.state === 'active' && !loggedOut ? formatAge(lastSignalAt(viaje), now, t) : null;
  const due = formatDay(viaje.due_date);
  const assigned = formatDay(viaje.assigned_at, viaje.timezone);
  return (
    <button
      type="button"
      onClick={() => onSelect(viaje.id)}
      aria-pressed={selected}
      className={`w-full text-left rounded-lg border p-3 transition-colors cursor-pointer ${selected ? 'border-teal-500 bg-teal-50/40' : 'border-slate-200 bg-white hover:border-slate-300'}`}
    >
      {/* Dentro de un <button> solo va contenido de frase: por eso <span> con `block`/`flex` y no <div>/<p>. */}
      <span className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 min-w-0">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: COLOR_HEX[viaje.color] }} aria-hidden />
          <span className="font-semibold text-slate-900 text-sm truncate">{viaje.route_number}</span>
        </span>
        <Badge size="sm" variant={colorVariant(viaje.color)}>
          {viaje.phase === 'por_salir' ? t('tracking.phaseDeparting') : t(STATE_KEY[viaje.state])}
        </Badge>
      </span>
      <span className="mt-1 block text-xs text-slate-600 truncate">
        {viaje.driver_name ?? t('tracking.noDriver')} · {viaje.plate ?? t('tracking.noVehicle')}
      </span>
      {(assigned || due) && (
        <span className="block text-xs text-slate-500 truncate">
          {assigned && `${t('tracking.assigned')} ${assigned}`}{assigned && due ? ' · ' : ''}{due && `${t('tracking.dueDate')} ${due}`}
        </span>
      )}
      {viaje.alerts.length > 0 && <span className="mt-2 block"><AlertDots alerts={viaje.alerts} /></span>}
      <span className="mt-2 block">
        <ProgressBar percent={viaje.progress.percent} failed={viaje.progress.failed} total={viaje.progress.total} />
        <span className="mt-1 text-xs text-slate-500 flex justify-between gap-2">
          <span>{viaje.progress.total ? t('tracking.progress', { done: viaje.progress.done, total: viaje.progress.total }) : t('tracking.noStops')}</span>
          {loggedOut && <span>{t('tracking.loggedOut')}</span>}
          {age && <span>{t('tracking.lastSeen', { age })}</span>}
        </span>
      </span>
    </button>
  );
}

export default memo(ViajeCard);
