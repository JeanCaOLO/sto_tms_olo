import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import Badge from '../../../components/base/Badge';
import { ordenarPorSecuencia } from '../stop-order';
import type { Viaje, ViajeDetalle } from '../types';
import { STATE_KEY, driverLoggedOut, formatAge, formatClock, formatDay, formatDistance, lastSignalAt, stateVariant } from '../tracking-logic';
import AlertDots from './AlertDots';
import ParadaItem from './ParadaItem';
import ProgressBar from './ProgressBar';

interface Props {
  viaje: Viaje;
  /** Detalle del MISMO viaje (la página ya filtra por id); null mientras carga. */
  detail: ViajeDetalle | null;
  error: boolean;
  now: number;
  onClose: () => void;
  /** Hueco para controles de pruebas (solo modo mock); el panel normal no tiene acciones. */
  children?: ReactNode;
}

/** Panel derecho, solo lectura: avance, hacia dónde va y los pedidos con sus evidencias de entrega. */
export default function ViajeDetallePanel({ viaje, detail, error, now, onClose, children }: Props) {
  const { t } = useTranslation();
  const view = detail ?? viaje;
  const loggedOut = driverLoggedOut(viaje);
  const age = loggedOut ? null : formatAge(lastSignalAt(viaje), now, t);
  const next = detail?.stops.find((s) => s.id === detail.next_stop_id);
  const eta = formatClock(next?.eta_at, viaje.timezone);

  return (
    <aside className="flex flex-col min-h-0 bg-white border border-slate-200 rounded-lg overflow-hidden" aria-label={viaje.route_number}>
      <div className="p-4 border-b border-slate-100 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="font-semibold text-slate-900 truncate">{viaje.route_number}</h2>
            <p className="text-xs text-slate-600 truncate">
              {viaje.driver_name ?? t('tracking.noDriver')} · {viaje.plate ?? t('tracking.noVehicle')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge size="sm" variant={stateVariant(viaje.state, viaje.signal)}>
              {viaje.phase === 'por_salir' ? t('tracking.phaseDeparting') : t(STATE_KEY[viaje.state])}
            </Badge>
            <button type="button" onClick={onClose} aria-label={t('tracking.close')} className="text-slate-400 hover:text-slate-700 cursor-pointer">
              <i className="ri-close-line text-lg" />
            </button>
          </div>
        </div>
        <div>
          <ProgressBar percent={view.progress.percent} failed={view.progress.failed} total={view.progress.total} />
          <p className="mt-1 text-xs text-slate-600 flex justify-between">
            <span>{t('tracking.progress', { done: view.progress.done, total: view.progress.total })}</span>
            <span className="font-medium">{view.progress.percent}%</span>
          </p>
        </div>
        <dl className="grid grid-cols-3 gap-2 text-xs">
          <div><dt className="text-slate-500">{t('tracking.assigned')}</dt><dd className="font-medium text-slate-800">{formatDay(viaje.assigned_at, viaje.timezone) ?? '—'}</dd></div>
          <div><dt className="text-slate-500">{t('tracking.dueDate')}</dt><dd className="font-medium text-slate-800">{formatDay(viaje.due_date) ?? '—'}</dd></div>
          <div>
            <dt className="text-slate-500">{t('tracking.overdue')}</dt>
            <dd className={`font-medium ${viaje.days_late > 0 ? 'text-red-600' : 'text-slate-800'}`}>
              {viaje.state !== 'active' ? '—' : viaje.days_late > 0 ? t('tracking.daysLate', { count: viaje.days_late }) : t('tracking.onTimeDays')}
            </dd>
          </div>
        </dl>
        {viaje.alerts.length > 0 && <AlertDots alerts={viaje.alerts} showText />}
        {viaje.state === 'active' && (
          <p className="text-sm text-slate-700" aria-live="polite">
            {viaje.phase === 'por_salir'
              ? t('tracking.phaseDeparting')
              : next
                ? t('tracking.nowHeading', { stop: `${next.sequence}. ${next.customer_name ?? next.order_number}` })
                : t('tracking.nowDone')}
            {next && viaje.phase !== 'por_salir' && (
              <span className="text-slate-500">
                {next.distance_m != null ? ` · ${formatDistance(next.distance_m)}` : ''}{eta ? ` · ${t('tracking.eta', { time: eta })}` : ''}
              </span>
            )}
          </p>
        )}
        {loggedOut && <p className="text-xs text-slate-500">{t('tracking.loggedOut')}</p>}
        {age && viaje.state === 'active' && <p className="text-xs text-slate-500">{t('tracking.lastSeen', { age })}</p>}
        {children}
      </div>

      <section className="flex-1 overflow-y-auto p-4">
        <h3 className="text-sm font-semibold text-slate-800 mb-2">{t('tracking.orders')}</h3>
        {!detail && !error && <p className="text-sm text-slate-500">{t('tracking.loading')}</p>}
        {!detail && error && <p className="text-sm text-red-600">{t('tracking.detailError')}</p>}
        <ul className="space-y-2">
          {detail && ordenarPorSecuencia(detail.stops).map((stop) => (
            <ParadaItem key={stop.id} stop={stop} isNext={stop.id === detail.next_stop_id} timezone={viaje.timezone} />
          ))}
        </ul>
      </section>
    </aside>
  );
}
