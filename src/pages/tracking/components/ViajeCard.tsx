import { useTranslation } from 'react-i18next';
import Badge from '../../../components/base/Badge';
import type { Viaje } from '../types';
import { COLOR_HEX, REVIEW_HEX, REVIEW_KEY, STATE_KEY, stateVariant } from '../tracking-logic';
import AlertDots from './AlertDots';
import ProgressBar from './ProgressBar';

interface Props {
  viaje: Viaje;
  selected: boolean;
  onSelect: () => void;
}

/** Tarjeta de la lista lateral: lo justo (viaje, conductor, avance). Al elegirla se abre el detalle. */
export default function ViajeCard({ viaje, selected, onSelect }: Props) {
  const { t } = useTranslation();
  return (
    <div
      className={`rounded-lg border p-3 transition-colors ${selected ? 'border-teal-500 bg-teal-50/40' : 'border-slate-200 bg-white hover:border-slate-300'}`}
    >
      <button type="button" onClick={onSelect} className="w-full text-left cursor-pointer" aria-pressed={selected}>
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
        {viaje.alerts.length > 0 && <div className="mt-2"><AlertDots alerts={viaje.alerts} /></div>}
        {viaje.review && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-700">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: REVIEW_HEX[viaje.review.color] }} aria-hidden />
            {t(REVIEW_KEY[viaje.review.color])}
            {viaje.review.reviewed_at && <i className="ri-check-double-line text-teal-600" title={t('tracking.reviewed')} />}
          </p>
        )}
        <div className="mt-2">
          <ProgressBar percent={viaje.progress.percent} failed={viaje.progress.failed} total={viaje.progress.total} />
          <p className="mt-1 text-xs text-slate-500 flex justify-between">
            <span>
              {viaje.progress.total
                ? t('tracking.progress', { done: viaje.progress.done, total: viaje.progress.total })
                : t('tracking.noStops')}
            </span>
          </p>
        </div>
      </button>
    </div>
  );
}
