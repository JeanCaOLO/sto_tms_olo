import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Button from '../../components/base/Button';
import { useModulePermissions } from '../../hooks/use-module-permissions';
import { confirmAction } from '../../lib/confirm';
import { notify } from '../../lib/notify';
import { completarViaje, revisarViaje, TrackingApiError } from './api';
import IniciarViajeModal from './components/IniciarViajeModal';
import ResumenBar from './components/ResumenBar';
import ViajeDetallePanel from './components/ViajeDetallePanel';
import ViajesSidebar from './components/ViajesSidebar';
import { useResumen, useViajeDetalle, useViajesEnVivo } from './hooks/useViajesEnVivo';
import type { ListMode } from './types';
import { formatAge } from './tracking-logic';

// Leaflet pesa: el mapa se descarga solo al abrir Tracking.
const FlotaMapa = lazy(() => import('./components/FlotaMapa'));

// El inicio real del viaje será al reportar la salida (app o TMS, aún sin definir). Mientras tanto el botón
// manual sirve para pruebas: visible en desarrollo o con VITE_TRACKING_MANUAL_START=true.
const MANUAL_START = import.meta.env.DEV || import.meta.env.VITE_TRACKING_MANUAL_START === 'true';

const PAGE_SIZE = 30;
const MAX_LIMIT = 100;
const SEARCH_DEBOUNCE_MS = 300;

export default function TrackingPage() {
  const { t } = useTranslation();
  const { canCreate, canEdit } = useModulePermissions('tracking');

  const [mode, setMode] = useState<ListMode>('active');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setQuery(search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  const params = useMemo(() => ({ mode, q: query, limit }), [mode, query, limit]);
  const list = useViajesEnVivo(params);
  const resumen = useResumen();
  const detail = useViajeDetalle(selectedId);

  const viajes = list.data?.items ?? [];
  const canLoadMore = viajes.length >= limit && limit < MAX_LIMIT;
  const selected = viajes.find((v) => v.id === selectedId) ?? (detail.data?.id === selectedId ? detail.data : null);
  const now = list.updatedAt ?? 0;

  const select = (id: string) => {
    if (id === selectedId) { setSelectedId(null); setExpanded(false); return; }
    setSelectedId(id);
  };

  const refresh = () => { void list.refresh(); void detail.refresh(); void resumen.refresh(); };

  const complete = useCallback(async () => {
    if (!selected) return;
    const pending = selected.progress.total - selected.progress.done;
    const message = pending > 0
      ? t('tracking.completeForce', { count: pending })
      : t('tracking.completeConfirm', { route: selected.route_number });
    if (!(await confirmAction({ message, confirmLabel: t('tracking.completeTrip') }))) return;
    try {
      await completarViaje(selected.id, pending > 0);
      notify(t('tracking.toastCompleted'), 'success');
      refresh();
    } catch (err) {
      const text = err instanceof TrackingApiError && err.message ? err.message : t('tracking.toastCompleteError');
      notify(text, 'error');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, t]);

  const review = useCallback(async () => {
    if (!selected) return;
    if (!(await confirmAction({ message: t('tracking.reviewConfirm', { route: selected.route_number }), confirmLabel: t('tracking.reviewMark') }))) return;
    try {
      await revisarViaje(selected.id);
      notify(t('tracking.toastReviewed'), 'success');
      refresh();
    } catch (err) {
      notify(err instanceof TrackingApiError && err.message ? err.message : t('tracking.toastReviewError'), 'error');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, t]);

  const showPanel = expanded && selected !== null;
  const layout = showPanel ? 'lg:grid-cols-[320px_minmax(0,1fr)_380px]' : 'lg:grid-cols-[320px_minmax(0,1fr)]';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('tracking.title')}</h1>
          <p className="text-sm text-slate-600">{t('tracking.subtitle')}</p>
        </div>
        <div className="flex items-center gap-3">
          {list.updatedAt && (
            <span className="text-xs text-slate-500">{t('tracking.updatedAgo', { age: formatAge(new Date(list.updatedAt).toISOString(), Date.now()) })}</span>
          )}
          <Button variant="secondary" size="sm" onClick={refresh} icon={<i className="ri-refresh-line" />}>
            {t('tracking.refresh')}
          </Button>
          {canCreate && MANUAL_START && (
            <Button size="sm" onClick={() => setStarting(true)} icon={<i className="ri-play-circle-line" />}>
              {t('tracking.startTrip')}
            </Button>
          )}
        </div>
      </div>

      <ResumenBar resumen={resumen.data} />

      <div className={`grid grid-cols-1 gap-4 h-[calc(100vh-16rem)] min-h-[520px] ${layout}`}>
        <ViajesSidebar
          viajes={viajes}
          loading={list.loading}
          error={list.error}
          mode={mode}
          reviewCount={resumen.data?.to_review ?? null}
          search={search}
          selectedId={selectedId}
          expanded={expanded}
          now={now}
          canLoadMore={canLoadMore}
          onMode={(value) => { setMode(value); setLimit(PAGE_SIZE); }}
          onSearch={(value) => { setSearch(value); setLimit(PAGE_SIZE); }}
          onSelect={select}
          onToggleMore={() => setExpanded((v) => !v)}
          onLoadMore={() => setLimit((v) => Math.min(v + PAGE_SIZE, MAX_LIMIT))}
          onRetry={refresh}
        />
        <Suspense fallback={<div className="rounded-lg border border-slate-200 bg-slate-50" />}>
          <FlotaMapa viajes={viajes} selectedId={selectedId} detail={detail.data} onSelect={select} />
        </Suspense>
        {showPanel && selected && (
          <ViajeDetallePanel
            viaje={selected}
            detail={detail.data}
            loading={detail.loading}
            canEdit={canEdit}
            now={now}
            onComplete={() => void complete()}
            onReview={() => void review()}
            onClose={() => setExpanded(false)}
          />
        )}
      </div>

      {canCreate && MANUAL_START && (
        <IniciarViajeModal
          isOpen={starting}
          onClose={() => setStarting(false)}
          onStarted={(routeId) => { setMode('active'); setSelectedId(routeId); refresh(); }}
        />
      )}
    </div>
  );
}
