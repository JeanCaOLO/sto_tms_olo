import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Button from '../../components/base/Button';
import { useModulePermissions } from '../../hooks/use-module-permissions';
import { confirmAction } from '../../lib/confirm';
import { notify } from '../../lib/notify';
import { completarViaje, TrackingApiError } from './api';
import IniciarViajeModal from './components/IniciarViajeModal';
import ViajeDetallePanel from './components/ViajeDetallePanel';
import ViajesSidebar from './components/ViajesSidebar';
import { useViajeDetalle, useViajesEnVivo } from './hooks/useViajesEnVivo';
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

  const [activos, setActivos] = useState(true);
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

  const params = useMemo(() => ({ activos, q: query, limit }), [activos, query, limit]);
  const list = useViajesEnVivo(params);
  const detail = useViajeDetalle(selectedId);

  const viajes = list.data?.items ?? [];
  const canLoadMore = viajes.length >= limit && limit < MAX_LIMIT;
  const selected = viajes.find((v) => v.id === selectedId) ?? (detail.data?.id === selectedId ? detail.data : null);
  const now = list.updatedAt ?? 0;

  const select = (id: string) => {
    if (id === selectedId) { setSelectedId(null); setExpanded(false); return; }
    setSelectedId(id);
  };

  const refresh = () => { void list.refresh(); void detail.refresh(); };

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

      <div className={`grid grid-cols-1 gap-4 h-[calc(100vh-11rem)] min-h-[520px] ${layout}`}>
        <ViajesSidebar
          viajes={viajes}
          loading={list.loading}
          error={list.error}
          activos={activos}
          search={search}
          selectedId={selectedId}
          expanded={expanded}
          now={now}
          canLoadMore={canLoadMore}
          onActivos={(value) => { setActivos(value); setLimit(PAGE_SIZE); }}
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
            onClose={() => setExpanded(false)}
          />
        )}
      </div>

      {canCreate && MANUAL_START && (
        <IniciarViajeModal
          isOpen={starting}
          onClose={() => setStarting(false)}
          onStarted={(routeId) => { setActivos(true); setSelectedId(routeId); refresh(); }}
        />
      )}
    </div>
  );
}
