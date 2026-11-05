import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Badge from '../../../components/base/Badge';
import type { EvidenceKind, Stop, StopType } from '../types';
import { EVIDENCE_KEY, STOP_KEY, formatClock, formatDistance, formatDwell, stopVariant } from '../tracking-logic';

const KINDS: Record<StopType, EvidenceKind[]> = {
  delivery: ['photo_invoice', 'signature'],
  collection: ['photo_product', 'signature'],
};

interface Props {
  stop: Stop;
  isNext: boolean;
  timezone: string | null;
}

/** Un pedido del viaje. Al abrirlo: quién recibió y las 2 evidencias (factura firmada o foto del producto, y firma). */
function ParadaItem({ stop, isNext, timezone }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const collection = stop.type === 'collection';
  const eta = stop.state === 'pending' ? formatClock(stop.eta_at, timezone) : null;
  const arrived = stop.state !== 'pending' ? formatClock(stop.arrived_at, timezone) : null;
  const siteArrived = formatClock(stop.site_arrived_at, timezone);
  const siteDeparted = formatClock(stop.site_departed_at, timezone);
  return (
    <li className={`rounded-lg border bg-white p-3 ${isNext ? 'border-teal-400' : 'border-slate-200'}`}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="w-full flex items-start gap-3 text-left cursor-pointer">
        <span className="w-6 h-6 shrink-0 rounded-full bg-slate-100 text-slate-700 text-xs font-bold flex items-center justify-center">{stop.sequence}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-slate-900 truncate">
            {collection && <i className="ri-arrow-go-back-line mr-1 text-amber-600" title={t('tracking.stopCollection')} aria-label={t('tracking.stopCollection')} />}
            {stop.customer_name ?? stop.address ?? stop.guide_number}
          </span>
          <span className="block text-xs text-slate-500 truncate">
            {stop.company_name ? t('tracking.orderFrom', { number: stop.order_number, company: stop.company_name }) : t('tracking.order', { number: stop.order_number })}
            {eta ? ` · ${t('tracking.eta', { time: eta })}` : ''}
            {stop.state === 'pending' && stop.distance_m != null ? ` · ${formatDistance(stop.distance_m)}` : ''}
            {arrived ? ` · ${arrived}` : ''}
          </span>
        </span>
        <Badge size="sm" variant={isNext ? 'info' : stopVariant(stop.state)}>{isNext ? t('tracking.nextBadge') : t(STOP_KEY[stop.state])}</Badge>
      </button>
      {open && (
        <div className="mt-2 space-y-2 border-t border-slate-100 pt-2 text-xs">
          {stop.invoice_number && <p className="text-slate-600">{t('tracking.invoice', { number: stop.invoice_number })}</p>}
          {stop.recipient_name && <p className="text-slate-600">{t('tracking.recipient', { name: stop.recipient_name })}</p>}
          {siteArrived && (
            <p className="text-slate-600">
              {siteDeparted
                ? t('tracking.onSite', { arrived: siteArrived, departed: siteDeparted, duration: formatDwell(stop.dwell_seconds) ?? '—' })
                : t('tracking.onSiteNow', { arrived: siteArrived, duration: formatDwell(Math.max(0, (Date.now() - new Date(stop.site_arrived_at as string).getTime()) / 1000)) ?? '—' })}
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            {KINDS[collection ? 'collection' : 'delivery'].map((kind) => {
              // La lista llega ordenada por fecha: se muestra la ÚLTIMA de cada tipo (si el chofer rehizo la foto, la vieja no tapa la buena).
              const ev = [...stop.evidences].reverse().find((e) => e.kind === kind);
              return ev?.url ? (
                <a key={kind} href={ev.url} target="_blank" rel="noreferrer" className="block rounded-lg border border-slate-200 overflow-hidden bg-slate-50">
                  <img src={ev.url} alt={t(EVIDENCE_KEY[kind])} className="w-full h-24 object-cover" loading="lazy" />
                  <span className="block px-2 py-1 text-slate-600">{t(EVIDENCE_KEY[kind])}</span>
                </a>
              ) : (
                <div key={kind} className="flex h-[7.5rem] flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-slate-200 text-slate-400">
                  <i className={kind === 'signature' ? 'ri-quill-pen-line text-xl' : kind === 'photo_product' ? 'ri-box-3-line text-xl' : 'ri-file-paper-2-line text-xl'} aria-hidden />
                  <span>{t(EVIDENCE_KEY[kind])}</span>
                  <span>{t('tracking.evidenceMissing')}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </li>
  );
}

export default memo(ParadaItem);
