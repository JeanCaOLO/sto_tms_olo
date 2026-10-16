import { useTranslation } from 'react-i18next';
import type { Resumen } from '../types';

interface Item {
  key: string;
  label: string;
  value: string;
  tone: string;
}

/** Franja de KPIs: lo esencial para ver cómo va la operación de un vistazo. */
export default function ResumenBar({ resumen }: { resumen: Resumen | null }) {
  const { t } = useTranslation();
  if (!resumen) return null;
  const items: Item[] = [
    { key: 'active', label: t('tracking.kpiActive'), value: String(resumen.active), tone: 'text-slate-900' },
    { key: 'departing', label: t('tracking.kpiDeparting'), value: String(resumen.departing), tone: 'text-slate-900' },
    { key: 'late', label: t('tracking.kpiLate'), value: String(resumen.late), tone: resumen.late ? 'text-red-600' : 'text-slate-900' },
    { key: 'noSignal', label: t('tracking.kpiNoSignal'), value: String(resumen.no_signal), tone: resumen.no_signal ? 'text-amber-600' : 'text-slate-900' },
    { key: 'stops', label: t('tracking.kpiStops'), value: `${resumen.stops_done}/${resumen.stops_total}`, tone: 'text-slate-900' },
    { key: 'incidents', label: t('tracking.kpiIncidents'), value: String(resumen.incidents), tone: resumen.incidents ? 'text-amber-600' : 'text-slate-900' },
    { key: 'review', label: t('tracking.kpiReview'), value: String(resumen.to_review), tone: resumen.to_review ? 'text-teal-700' : 'text-slate-900' },
  ];
  return (
    <dl className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2" aria-label={t('tracking.kpiTitle')}>
      {items.map((item) => (
        <div key={item.key} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
          <dt className="text-xs text-slate-500">{item.label}</dt>
          <dd className={`text-xl font-semibold ${item.tone}`}>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
