import { useTranslation } from 'react-i18next';
import { formatAge } from '../tracking-logic';
import type { ChoferEnLinea } from '../types';

interface Props {
  choferes: ChoferEnLinea[];
  now: number;
}

const DOT: Record<string, string> = { online: 'bg-emerald-600', stale: 'bg-amber-600' };

/** Choferes con la app abierta que aún NO tienen un viaje en tránsito (los que sí, ya salen en la lista de viajes). */
export default function ChoferesEnLinea({ choferes, now }: Props) {
  const { t } = useTranslation();
  const free = choferes.filter((c) => c.route_id === null && (c.signal === 'online' || c.signal === 'stale'));
  if (!free.length) return null;
  return (
    <section aria-label={t('tracking.driversOnline')} className="pt-3 mt-1 border-t border-slate-100">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
        {t('tracking.driversOnline')} ({free.length})
      </h2>
      <ul className="space-y-1">
        {free.map((chofer) => (
          <li key={chofer.driver_id} className="flex items-center justify-between gap-2 text-sm rounded-md bg-slate-50 px-2 py-1.5">
            <span className="flex items-center gap-2 min-w-0">
              <span className={`w-2 h-2 rounded-full shrink-0 ${DOT[chofer.signal]}`} aria-hidden />
              <span className="truncate text-slate-800">{chofer.driver_name ?? t('tracking.noDriver')}</span>
              {chofer.country && <span className="text-xs text-slate-400">{chofer.country}</span>}
            </span>
            <span className="text-xs text-slate-500 shrink-0">
              {t('tracking.noTripYet')} · {formatAge(chofer.last_seen_at, now, t)}
              {chofer.battery_pct !== null && ` · ${chofer.battery_pct}%`}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
