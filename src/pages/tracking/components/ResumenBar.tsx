import { useTranslation } from 'react-i18next';
import type { KpiFilter } from '../tracking-logic';
import type { Resumen } from '../types';

interface Props {
  resumen: Resumen | null;
  selected: KpiFilter | null;
  onSelect: (kpi: KpiFilter | null) => void;
}

const TILES: { key: KpiFilter; field: keyof Resumen; label: string; alert?: string }[] = [
  { key: 'active', field: 'active', label: 'tracking.kpiActive' },
  { key: 'on_time', field: 'on_time', label: 'tracking.kpiOnTime' },
  { key: 'late', field: 'late', label: 'tracking.kpiLate', alert: 'text-red-600' },
  { key: 'no_signal', field: 'no_signal', label: 'tracking.kpiNoSignal', alert: 'text-amber-600' },
  { key: 'completed_today', field: 'completed_today', label: 'tracking.kpiCompletedToday' },
];

/** KPIs por VIAJE, lo que se ve de un vistazo. Cada uno filtra la lista y el mapa; otro clic quita el filtro. */
export default function ResumenBar({ resumen, selected, onSelect }: Props) {
  const { t } = useTranslation();
  const hasDeliveries = resumen?.deliveries_total !== undefined;
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2" role="group" aria-label={t('tracking.kpiTitle')}>
        {TILES.map((tile) => {
          const value = resumen ? resumen[tile.field] : null;
          const on = selected === tile.key;
          const tone = value && tile.alert ? tile.alert : 'text-slate-900';
          return (
            <button
              key={tile.key}
              type="button"
              aria-pressed={on}
              onClick={() => onSelect(on ? null : tile.key)}
              className={`rounded-lg border px-3 py-1.5 text-left cursor-pointer transition-colors ${on ? 'border-teal-500 bg-teal-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}
            >
              <span className="block text-xs text-slate-500">{t(tile.label)}</span>
              <span className={`block text-lg font-semibold leading-tight ${tone}`}>{value ?? '—'}</span>
            </button>
          );
        })}
      </div>
      {hasDeliveries && (
        <p className="text-xs text-slate-600" data-testid="deliveries-progress">
          {t('tracking.deliveriesProgress', {
            done: resumen?.deliveries_done ?? 0,
            total: resumen?.deliveries_total ?? 0,
            remaining: resumen?.deliveries_remaining ?? 0,
          })}
        </p>
      )}
    </div>
  );
}
