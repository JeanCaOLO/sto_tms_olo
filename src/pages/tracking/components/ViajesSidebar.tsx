import { useTranslation } from 'react-i18next';
import Input from '../../../components/base/Input';
import type { ListMode, Viaje } from '../types';
import ViajeCard from './ViajeCard';

interface Props {
  viajes: Viaje[];
  loading: boolean;
  error: Error | null;
  mode: ListMode;
  reviewCount: number | null;
  search: string;
  selectedId: string | null;
  expanded: boolean;
  now: number;
  canLoadMore: boolean;
  onMode: (value: ListMode) => void;
  onSearch: (value: string) => void;
  onSelect: (id: string) => void;
  onToggleMore: () => void;
  onLoadMore: () => void;
  onRetry: () => void;
}

const chip = (on: boolean) =>
  `px-3 py-1 text-xs font-medium rounded-md cursor-pointer transition-colors ${on ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`;

/** Lista lateral de viajes: filtro Activos/Todos, búsqueda y tarjetas (recientes primero). */
export default function ViajesSidebar(props: Props) {
  const { t } = useTranslation();
  const { viajes, loading, error, mode } = props;
  return (
    <aside className="flex flex-col min-h-0 bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="p-3 space-y-2 border-b border-slate-100">
        <div className="inline-flex bg-slate-100 rounded-lg p-1" role="group">
          <button type="button" className={chip(mode === 'active')} aria-pressed={mode === 'active'} onClick={() => props.onMode('active')}>
            {t('tracking.filterActive')}
          </button>
          <button type="button" className={chip(mode === 'all')} aria-pressed={mode === 'all'} onClick={() => props.onMode('all')}>
            {t('tracking.filterAll')}
          </button>
          <button type="button" className={chip(mode === 'review')} aria-pressed={mode === 'review'} onClick={() => props.onMode('review')}>
            {t('tracking.filterReview')}{props.reviewCount ? ` (${props.reviewCount})` : ''}
          </button>
        </div>
        <Input
          value={props.search}
          onChange={(event) => props.onSearch(event.target.value)}
          placeholder={t('tracking.search')}
          aria-label={t('tracking.search')}
        />
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {error && !viajes.length && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
            {t('tracking.loadError')}
            <button type="button" onClick={props.onRetry} className="ml-2 underline cursor-pointer">
              {t('tracking.retry')}
            </button>
          </div>
        )}
        {loading && !viajes.length && !error && (
          <p className="text-sm text-slate-500 text-center py-6">{t('tracking.loading')}</p>
        )}
        {!loading && !error && !viajes.length && (
          <div className="text-center py-8 text-slate-500">
            <i className="ri-truck-line text-3xl text-slate-300" />
            <p className="text-sm mt-1">{t('tracking.noTrips')}</p>
            <p className="text-xs text-slate-400">{t('tracking.noTripsHint')}</p>
          </div>
        )}
        {viajes.map((viaje) => (
          <ViajeCard
            key={viaje.id}
            viaje={viaje}
            now={props.now}
            selected={props.selectedId === viaje.id}
            expanded={props.expanded}
            onSelect={() => props.onSelect(viaje.id)}
            onToggleMore={props.onToggleMore}
          />
        ))}
        {props.canLoadMore && (
          <button type="button" onClick={props.onLoadMore} className="w-full text-sm text-teal-700 hover:underline py-2 cursor-pointer">
            {t('tracking.loadMore')}
          </button>
        )}
      </div>
    </aside>
  );
}
