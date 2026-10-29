import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Button from '../../components/base/Button';
import { useModulePermissions } from '../../hooks/use-module-permissions';
import { isTrackingMock, trackingNow } from './api';
import IniciarViajeModal from './components/IniciarViajeModal';
import ResumenBar from './components/ResumenBar';
import ViajeDetallePanel from './components/ViajeDetallePanel';
import ViajesSidebar from './components/ViajesSidebar';
import { useNow } from './hooks/useNow';
import { useTrackingCountry } from './hooks/useTrackingCountry';
import { useChoferesEnLinea, useViajeDetalle, useViajesEnVivo } from './hooks/useViajesEnVivo';
import { formatAge, matchesKpi, type KpiFilter } from './tracking-logic';
import type { ListMode } from './types';

// Leaflet pesa: el mapa se descarga solo al abrir Tracking. La simulación es solo del modo mock.
const FlotaMapa = lazy(() => import('./components/FlotaMapa'));
const SimulacionControles = lazy(() => import('./components/SimulacionControles'));
const CierrePlanificacion = lazy(() => import('./mock/CierrePlanificacion'));

const PAGE_SIZE = 30;
const MAX_LIMIT = 100;
const SEARCH_DEBOUNCE_MS = 300;

/** Tracking: SOLO monitoreo de los viajes en curso (lista, mapa, avance y evidencias). Sin acciones sobre el viaje. */
export default function TrackingPage() {
  const { t } = useTranslation();
  const { canCreate } = useModulePermissions('tracking');
  const mock = isTrackingMock();

  const country = useTrackingCountry();
  const [mode, setMode] = useState<ListMode>('active');
  const [kpi, setKpi] = useState<KpiFilter | null>(null);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  // Al cambiar de país se cierra el viaje abierto: puede ser de otro país.
  useEffect(() => { setSelectedId(null); }, [country]);
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  const list = useViajesEnVivo(useMemo(() => ({ mode, q: query, limit, country }), [mode, query, limit, country]));
  const detail = useViajeDetalle(selectedId);
  // Si falla (p. ej. rol sin acceso) la lista de choferes simplemente no aparece; no afecta al monitoreo de viajes.
  const drivers = useChoferesEnLinea(country);
  const now = useNow(trackingNow, list.updatedAt);

  const viajes = useMemo(() => list.data?.items ?? [], [list.data]);
  const visibles = useMemo(() => (kpi ? viajes.filter((v) => matchesKpi(v, kpi, now)) : viajes), [viajes, kpi, now]);
  const detailData = detail.data?.id === selectedId ? detail.data : null;
  const selected = viajes.find((v) => v.id === selectedId) ?? detailData;
  const canLoadMore = viajes.length >= limit && limit < MAX_LIMIT;
  const stale = list.error !== null && list.data !== null;

  // Los KPIs no dependen de Activos/Todos ni del filtro: se conserva el último valor del país mientras recarga.
  const keptSummary = useRef<{ country: string | null; summary: NonNullable<typeof list.data>['summary'] } | null>(null);
  if (list.data?.summary) keptSummary.current = { country, summary: list.data.summary };
  const summary = list.data?.summary ?? (keptSummary.current?.country === country ? keptSummary.current.summary : null);
  const select = useCallback((id: string) => setSelectedId((current) => (current === id ? null : id)), []);
  const refresh = () => { list.refresh(); detail.refresh(); drivers.refresh(); };
  const pickKpi = (value: KpiFilter | null) => {
    setKpi(value);
    setSelectedId(null); // el viaje abierto puede no entrar en el indicador
    if (value) setMode(value === 'completed_today' ? 'all' : 'active');
    setLimit(PAGE_SIZE);
  };

  // En laptops (lg) columnas más angostas para que el mapa no quede aplastado; desde 2xl (≥ 1536 px), las anchas.
  const layout = selected
    ? 'lg:grid-cols-[260px_minmax(0,1fr)_320px] 2xl:grid-cols-[320px_minmax(0,1fr)_380px]'
    : 'lg:grid-cols-[260px_minmax(0,1fr)] 2xl:grid-cols-[320px_minmax(0,1fr)]';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">{t('tracking.title')}</h1>
        {mock && (
          <div className="flex items-center gap-2">
            <Suspense fallback={null}><SimulacionControles onChange={refresh} /></Suspense>
            {canCreate && (
              <Button size="sm" onClick={() => setStarting(true)} icon={<i className="ri-play-circle-line" />}>{t('tracking.startTrip')}</Button>
            )}
          </div>
        )}
      </div>

      {stale && (
        <p role="status" className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
          <i className="ri-wifi-off-line" aria-hidden />
          {t('tracking.staleData', { age: formatAge(new Date(list.updatedAt ?? Date.now()).toISOString(), Date.now(), t) })}
          <button type="button" onClick={list.refresh} className="underline cursor-pointer">{t('tracking.retry')}</button>
        </p>
      )}

      <ResumenBar resumen={summary ?? null} selected={kpi} onSelect={pickKpi} />

      <div className={`grid grid-cols-1 gap-4 h-[calc(100vh-16rem)] min-h-[520px] ${layout}`}>
        <ViajesSidebar
          viajes={visibles}
          choferes={kpi ? [] : drivers.data ?? []}
          loading={list.loading}
          error={list.error !== null}
          mode={mode}
          search={search}
          selectedId={selectedId}
          now={now}
          canLoadMore={canLoadMore}
          filtered={kpi !== null}
          onMode={(value) => { setMode(value); setKpi(null); setLimit(PAGE_SIZE); }}
          onSearch={(value) => { setSearch(value); setLimit(PAGE_SIZE); }}
          onSelect={select}
          onLoadMore={() => setLimit((v) => Math.min(v + PAGE_SIZE, MAX_LIMIT))}
          onRetry={list.refresh}
        />
        <Suspense fallback={<div className="rounded-lg border border-slate-200 bg-slate-50" />}>
          <FlotaMapa
            fitKey={`${country}|${mode}|${kpi}|${query}`}
            viajes={visibles}
            selectedId={selectedId}
            detail={detailData}
            onSelect={select}
          />
        </Suspense>
        {selected && (
          <ViajeDetallePanel
            key={selected.id}
            viaje={selected}
            detail={detailData}
            error={detail.error !== null}
            now={now}
            onClose={() => setSelectedId(null)}
          >
            {mock && selected.state === 'active' && (
              <Suspense fallback={null}><CierrePlanificacion tripId={selected.id} onDone={refresh} /></Suspense>
            )}
          </ViajeDetallePanel>
        )}
      </div>

      {mock && canCreate && (
        <IniciarViajeModal
          isOpen={starting}
          onClose={() => setStarting(false)}
          onStarted={(routeId) => { setMode('active'); setKpi(null); setSelectedId(routeId); refresh(); }}
        />
      )}
    </div>
  );
}
