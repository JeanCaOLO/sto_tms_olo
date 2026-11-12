import { lazy, Suspense, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import Badge from '../../../components/base/Badge';
import { errorKey, trackingNow } from '../api';
import { useNow } from '../hooks/useNow';
import { useMisEntregas } from '../hooks/useViajesEnVivo';
import { formatAge, formatClock, formatDistance, formatDwell } from '../tracking-logic';
import type { EntregaCliente, EntregaStatus } from '../types';

const MapaEntrega = lazy(() => import('./MapaEntrega'));

const BADGE: Record<EntregaStatus, 'info' | 'success' | 'warning' | 'danger' | 'default'> = {
  listo: 'warning', en_camino: 'info', entregado: 'success', no_entregado: 'danger', cerrado: 'default',
};

/** Frase principal de la entrega: lo que el cliente quiere saber de un vistazo. */
function headline(e: EntregaCliente, now: number, t: (key: string, opts?: Record<string, unknown>) => string): string {
  if (e.status === 'listo') return t('tracking.client.ready');
  if (e.status === 'entregado') return t('tracking.client.delivered', { time: formatClock(e.delivered_at) ?? '—' });
  if (e.status === 'no_entregado') return t('tracking.client.failed');
  if (e.status === 'cerrado') return t('tracking.client.closed');
  if (!e.eta_at) return t('tracking.client.onTheWay');
  const minutes = Math.round((new Date(e.eta_at).getTime() - now) / 60_000);
  return minutes <= 1
    ? t('tracking.client.arriving')
    : t('tracking.client.etaIn', { minutes, time: formatClock(e.eta_at) ?? '—' });
}

function EntregaCard({ entrega, now }: { entrega: EntregaCliente; now: number }) {
  const { t } = useTranslation();
  const distance = entrega.status === 'en_camino' ? formatDistance(entrega.distance_m) : null;
  const seen = entrega.truck ? formatAge(entrega.truck.recorded_at, now, t) : null;
  const destination = entrega.lat != null && entrega.lng != null ? { lat: entrega.lat, lng: entrega.lng } : null;
  return (
    <li className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-slate-900 truncate">{entrega.point_name ?? entrega.address ?? entrega.order_number}</p>
          <p className="text-xs text-slate-500 truncate">
            {t('tracking.order', { number: entrega.order_number })}
            {entrega.address ? ` · ${entrega.address}` : ''}
          </p>
        </div>
        <Badge variant={BADGE[entrega.status]}>{t(`tracking.client.status.${entrega.status}`)}</Badge>
      </div>
      <p className="text-base text-slate-800">{headline(entrega, now, t)}</p>
      <p className="text-xs text-slate-500">
        {entrega.stops_ahead != null && entrega.stops_ahead > 0 ? `${t('tracking.client.stopsAhead', { count: entrega.stops_ahead })}` : ''}
        {distance ? `${entrega.stops_ahead ? ' · ' : ''}${distance}` : ''}
        {seen ? ` · ${t('tracking.client.updated', { age: seen })}` : ''}
      </p>
      {entrega.dwell_seconds != null && entrega.status === 'entregado' && (
        <p className="text-xs text-slate-500">{t('tracking.client.onSite', { duration: formatDwell(entrega.dwell_seconds) ?? '—' })}</p>
      )}
      {entrega.truck && (
        <Suspense fallback={<div className="h-64 rounded-lg bg-slate-50" />}>
          <MapaEntrega truck={entrega.truck} destination={destination} />
        </Suspense>
      )}
    </li>
  );
}

/** Tracking para el rol Cliente: solo SU entrega (listo, en camino o entregada) y por dónde va. Solo lectura. */
export default function MisEntregas() {
  const { t } = useTranslation();
  const list = useMisEntregas();
  const now = useNow(trackingNow, list.data);
  const items = useMemo(() => list.data?.items ?? [], [list.data]);
  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      <h1 className="text-2xl font-bold text-slate-900">{t('tracking.client.title')}</h1>
      {list.error && !list.data && (
        <p role="alert" className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-800">
          {t(errorKey(list.error))} <button type="button" onClick={list.refresh} className="underline cursor-pointer">{t('tracking.retry')}</button>
        </p>
      )}
      {list.data && items.length === 0 && <p className="text-sm text-slate-600">{t('tracking.client.empty')}</p>}
      <ul className="space-y-3">
        {items.map((entrega) => <EntregaCard key={entrega.id} entrega={entrega} now={now} />)}
      </ul>
    </div>
  );
}
