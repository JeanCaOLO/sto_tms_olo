import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Badge from '../../../components/base/Badge';
import Button from '../../../components/base/Button';
import type { Stop, TripEvent, Viaje, ViajeDetalle } from '../types';
import { EVIDENCE_KEY, STATE_KEY, STOP_KEY, formatAge, readyToComplete, speedKmh, stateVariant, stopVariant } from '../tracking-logic';
import ProgressBar from './ProgressBar';

interface Props {
  viaje: Viaje;
  detail: ViajeDetalle | null;
  loading: boolean;
  canEdit: boolean;
  now: number;
  onComplete: () => void;
  onClose: () => void;
}

function StopEvidence({ stop }: { stop: Stop }) {
  const { t } = useTranslation();
  const hasAny = stop.evidences.length || stop.incidents.length || stop.returns.length;
  return (
    <div className="mt-2 space-y-3 border-t border-slate-100 pt-3 text-xs">
      {stop.recipient_name && <p className="text-slate-600">{t('tracking.recipient', { name: stop.recipient_name })}</p>}
      {!hasAny && <p className="text-slate-400">{t('tracking.noEvidences')}</p>}
      {stop.evidences.length > 0 && (
        <div>
          <p className="font-medium text-slate-700 mb-1">{t('tracking.evidences')}</p>
          <div className="grid grid-cols-2 gap-2">
            {stop.evidences.map((ev) => (
              <a key={ev.id} href={ev.url} target="_blank" rel="noreferrer" className="block rounded-lg border border-slate-200 overflow-hidden bg-slate-50">
                <img src={ev.url} alt={t(EVIDENCE_KEY[ev.kind] ?? 'tracking.evidenceOther')} className="w-full h-24 object-cover" loading="lazy" />
                <span className="block px-2 py-1 text-slate-600">{t(EVIDENCE_KEY[ev.kind] ?? 'tracking.evidenceOther')}</span>
              </a>
            ))}
          </div>
        </div>
      )}
      {stop.incidents.length > 0 && (
        <div>
          <p className="font-medium text-slate-700 mb-1">{t('tracking.incidents')}</p>
          <ul className="space-y-1">
            {stop.incidents.map((item, index) => (
              <li key={`${item.at}-${index}`} className="rounded bg-amber-50 text-amber-800 px-2 py-1">{item.text}</li>
            ))}
          </ul>
        </div>
      )}
      {stop.returns.length > 0 && (
        <div>
          <p className="font-medium text-slate-700 mb-1">{t('tracking.returns')}</p>
          <ul className="space-y-1">
            {stop.returns.map((ret) => (
              <li key={ret.id} className="rounded bg-red-50 text-red-800 px-2 py-1">
                {t('tracking.returnLine', { qty: ret.quantity ?? '-', product: ret.product_name ?? ret.return_number, reason: ret.reason })}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function StopItem({ stop }: { stop: Stop }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <li className="rounded-lg border border-slate-200 bg-white p-3">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="w-full flex items-start gap-3 text-left cursor-pointer">
        <span className="w-6 h-6 shrink-0 rounded-full bg-slate-100 text-slate-700 text-xs font-bold flex items-center justify-center">{stop.sequence}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-slate-900 truncate">{stop.customer_name ?? stop.address ?? stop.guide_number}</span>
          <span className="block text-xs text-slate-500 truncate">
            {t('tracking.order', { number: stop.order_number })}
            {stop.invoice_number ? ` · ${t('tracking.invoice', { number: stop.invoice_number })}` : ''}
          </span>
        </span>
        <Badge size="sm" variant={stopVariant(stop.state)}>{t(STOP_KEY[stop.state])}</Badge>
      </button>
      {open && <StopEvidence stop={stop} />}
    </li>
  );
}

function EventLine({ event }: { event: TripEvent }) {
  return (
    <li className="flex gap-2 text-xs text-slate-600">
      <span className="shrink-0 text-slate-400">{new Date(event.at).toLocaleString()}</span>
      <span className="truncate">{event.type}{event.notes ? ` — ${event.notes}` : ''}</span>
    </li>
  );
}

/** Panel derecho: avance, pedidos del viaje y, por pedido, lo que subió la app (evidencias, novedades, devoluciones). */
export default function ViajeDetallePanel({ viaje, detail, loading, canEdit, now, onComplete, onClose }: Props) {
  const { t } = useTranslation();
  const [advanced, setAdvanced] = useState(false);
  const view = detail ?? viaje;
  const age = formatAge(viaje.position?.recorded_at, now);
  const kmh = speedKmh(viaje.position?.speed_mps);

  return (
    <aside className="flex flex-col min-h-0 bg-white border border-slate-200 rounded-lg overflow-hidden" aria-label={viaje.route_number}>
      <div className="p-4 border-b border-slate-100">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="font-semibold text-slate-900 truncate">{viaje.route_number}</h2>
            <p className="text-xs text-slate-600 truncate">
              {viaje.driver_name ?? t('tracking.noDriver')} · {viaje.plate ?? t('tracking.noVehicle')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge size="sm" variant={stateVariant(viaje.state, viaje.signal)}>{t(STATE_KEY[viaje.state])}</Badge>
            <button type="button" onClick={onClose} aria-label={t('tracking.close')} className="text-slate-400 hover:text-slate-700 cursor-pointer">
              <i className="ri-close-line text-lg" />
            </button>
          </div>
        </div>
        <div className="mt-3">
          <ProgressBar percent={view.progress.percent} failed={view.progress.failed} total={view.progress.total} />
          <p className="mt-1 text-xs text-slate-600 flex justify-between">
            <span>{t('tracking.progress', { done: view.progress.done, total: view.progress.total })}</span>
            <span className="font-medium">{view.progress.percent}%</span>
          </p>
        </div>
        {viaje.state === 'active' && (
          <p className="mt-2 text-xs text-slate-500 flex flex-wrap gap-x-3">
            {age && <span>{t('tracking.lastSeen', { age })}</span>}
            {kmh !== null && <span>{t('tracking.speed', { kmh })}</span>}
            {viaje.position?.battery_pct != null && <span>{t('tracking.battery', { pct: viaje.position.battery_pct })}</span>}
          </p>
        )}
        {canEdit && viaje.state === 'active' && (
          <Button size="sm" variant={readyToComplete(view) ? 'success' : 'secondary'} className="mt-3" onClick={onComplete}>
            {t('tracking.completeTrip')}
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <section>
          <h3 className="text-sm font-semibold text-slate-800 mb-2">{t('tracking.orders')}</h3>
          {loading && !detail && <p className="text-sm text-slate-500">{t('tracking.loading')}</p>}
          <ul className="space-y-2">{detail?.stops.map((stop) => <StopItem key={stop.id} stop={stop} />)}</ul>
        </section>

        <section>
          <button type="button" onClick={() => setAdvanced((v) => !v)} aria-expanded={advanced} className="flex items-center gap-1 text-sm font-medium text-slate-700 cursor-pointer">
            <i className={advanced ? 'ri-arrow-down-s-line' : 'ri-arrow-right-s-line'} />
            {t('tracking.advanced')}
          </button>
          {advanced && (
            <div className="mt-2">
              <h4 className="text-xs font-semibold text-slate-600 mb-1">{t('tracking.events')}</h4>
              {detail?.events.length ? (
                <ul className="space-y-1">{detail.events.map((event) => <EventLine key={event.id} event={event} />)}</ul>
              ) : (
                <p className="text-xs text-slate-400">{t('tracking.noEvents')}</p>
              )}
            </div>
          )}
        </section>
      </div>
    </aside>
  );
}
