import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Badge from '../../../components/base/Badge';
import type { EvidenceKind, Stop } from '../types';
import { EVIDENCE_KEY, STOP_KEY, formatClock, formatDistance, stopVariant } from '../tracking-logic';

const KINDS: EvidenceKind[] = ['photo_invoice', 'signature'];

interface Props {
  stop: Stop;
  isNext: boolean;
  timezone: string | null;
}

/** Un pedido del viaje. Al abrirlo: quién recibió y las 2 evidencias de entrega (factura firmada y firma). */
function ParadaItem({ stop, isNext, timezone }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const eta = stop.state === 'pending' ? formatClock(stop.eta_at, timezone) : null;
  const arrived = stop.state !== 'pending' ? formatClock(stop.arrived_at, timezone) : null;
  return (
    <li className={`rounded-lg border bg-white p-3 ${isNext ? 'border-teal-400' : 'border-slate-200'}`}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="w-full flex items-start gap-3 text-left cursor-pointer">
        <span className="w-6 h-6 shrink-0 rounded-full bg-slate-100 text-slate-700 text-xs font-bold flex items-center justify-center">{stop.sequence}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-slate-900 truncate">{stop.customer_name ?? stop.address ?? stop.guide_number}</span>
          <span className="block text-xs text-slate-500 truncate">
            {t('tracking.order', { number: stop.order_number })}
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
          <div className="grid grid-cols-2 gap-2">
            {KINDS.map((kind) => {
              const ev = stop.evidences.find((e) => e.kind === kind);
              return ev?.url ? (
                <a key={kind} href={ev.url} target="_blank" rel="noreferrer" className="block rounded-lg border border-slate-200 overflow-hidden bg-slate-50">
                  <img src={ev.url} alt={t(EVIDENCE_KEY[kind])} className="w-full h-24 object-cover" loading="lazy" />
                  <span className="block px-2 py-1 text-slate-600">{t(EVIDENCE_KEY[kind])}</span>
                </a>
              ) : (
                <div key={kind} className="flex h-[7.5rem] flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-slate-200 text-slate-400">
                  <i className={kind === 'signature' ? 'ri-quill-pen-line text-xl' : 'ri-file-paper-2-line text-xl'} aria-hidden />
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
