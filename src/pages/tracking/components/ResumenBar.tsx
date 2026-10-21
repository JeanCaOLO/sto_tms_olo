import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Resumen } from '../types';

interface Item {
  key: string;
  label: string;
  value: string;
  tone: string;
}

/** Franja de KPIs por VIAJE (4 esenciales); lo medido por pedido (entregas, novedades) solo si se pide (menos es más). */
export default function ResumenBar({ resumen }: { resumen: Resumen | null }) {
  const { t } = useTranslation();
  const [more, setMore] = useState(false);
  if (!resumen) return null;
  const warn = (n: number, tone: string) => (n ? tone : 'text-slate-900');
  const main: Item[] = [
    { key: 'active', label: t('tracking.kpiActive'), value: String(resumen.active), tone: 'text-slate-900' },
    { key: 'late', label: t('tracking.kpiLate'), value: String(resumen.late), tone: warn(resumen.late, 'text-red-600') },
    { key: 'noSignal', label: t('tracking.kpiNoSignal'), value: String(resumen.no_signal), tone: warn(resumen.no_signal, 'text-amber-600') },
    { key: 'review', label: t('tracking.kpiReview'), value: String(resumen.to_review), tone: warn(resumen.to_review, 'text-teal-700') },
  ];
  const extra: Item[] = [
    { key: 'departing', label: t('tracking.kpiDeparting'), value: String(resumen.departing), tone: 'text-slate-900' },
    { key: 'stops', label: t('tracking.kpiStops'), value: `${resumen.stops_done}/${resumen.stops_total}`, tone: 'text-slate-900' },
    { key: 'incidents', label: t('tracking.kpiIncidents'), value: String(resumen.incidents), tone: warn(resumen.incidents, 'text-amber-600') },
  ];
  const items = more ? [...main, ...extra] : main;
  return (
    <div className="flex items-stretch gap-2">
      <dl className="flex-1 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-2" aria-label={t('tracking.kpiTitle')}>
        {items.map((item) => (
          <div key={item.key} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5">
            <dt className="text-xs text-slate-500">{item.label}</dt>
            <dd className={`text-lg font-semibold leading-tight ${item.tone}`}>{item.value}</dd>
          </div>
        ))}
      </dl>
      <button
        type="button"
        onClick={() => setMore((v) => !v)}
        aria-expanded={more}
        aria-label={more ? t('tracking.kpiLess') : t('tracking.kpiMore')}
        title={more ? t('tracking.kpiLess') : t('tracking.kpiMore')}
        className="shrink-0 w-9 rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-slate-800 cursor-pointer"
      >
        <i className={more ? 'ri-subtract-line' : 'ri-add-line'} />
      </button>
    </div>
  );
}
