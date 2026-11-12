// Resumen (KPIs) y lista de viajes con devoluciones, según la pestaña y el periodo elegidos.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReturnSummary, ReturnTrip, TripFilter } from '../../../lib/devoluciones/types';
import { getSummary, listTripsPage } from '../api/devolucionesApi';

export interface UseReturnTrips {
  summary: ReturnSummary | null;
  trips: ReturnTrip[];
  loading: boolean;
  error: string | null;
  reload: () => void;
  hasMore: boolean;
  loadingMore: boolean;
  loadMoreError: string | null;
  loadMore: () => Promise<void>;
}

export function useReturnTrips(state: TripFilter, from: string, to: string): UseReturnTrips {
  const [summary, setSummary] = useState<ReturnSummary | null>(null);
  const [trips, setTrips] = useState<ReturnTrip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const requestSeq = useRef(0);
  const moreInFlight = useRef(false);
  const filterKey = JSON.stringify([state, from, to]);
  const loadedFilter = useRef<string | null>(null);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    const seq = ++requestSeq.current;
    moreInFlight.current = false;
    setLoadingMore(false);
    setLoadMoreError(null);
    setNextCursor(null);
    if (loadedFilter.current !== filterKey) setTrips([]);
    loadedFilter.current = filterKey;
    setLoading(true);
    setError(null);
    Promise.all([getSummary(), listTripsPage({ state, from, to })])
      .then(([nextSummary, page]) => {
        if (seq !== requestSeq.current) return;
        setSummary(nextSummary);
        setTrips(page.trips);
        setNextCursor(page.nextCursor);
      })
      .catch((e: unknown) => { if (seq === requestSeq.current) setError(e instanceof Error ? e.message : 'No se pudo cargar'); })
      .finally(() => { if (seq === requestSeq.current) setLoading(false); });
    return () => { requestSeq.current = seq + 1; };
  }, [state, from, to, version, filterKey]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loading || moreInFlight.current || loadedFilter.current !== filterKey) return;
    const seq = requestSeq.current;
    moreInFlight.current = true;
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const page = await listTripsPage({ state, from, to }, nextCursor);
      if (seq !== requestSeq.current) return;
      setTrips((current) => {
        const seen = new Set(current.map((trip) => trip.route_id));
        return [...current, ...page.trips.filter((trip) => {
          if (seen.has(trip.route_id)) return false;
          seen.add(trip.route_id);
          return true;
        })];
      });
      setNextCursor(page.nextCursor);
    } catch (e) {
      if (seq === requestSeq.current) setLoadMoreError(e instanceof Error ? e.message : 'No se pudieron cargar más viajes.');
    } finally {
      if (seq === requestSeq.current) {
        moreInFlight.current = false;
        setLoadingMore(false);
      }
    }
  }, [state, from, to, nextCursor, loading, filterKey]);

  return { summary, trips, loading, error, reload, hasMore: nextCursor !== null, loadingMore, loadMoreError, loadMore };
}
