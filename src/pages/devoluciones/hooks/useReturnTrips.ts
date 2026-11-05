// Resumen (KPIs) y lista de viajes con devoluciones, según la pestaña y el periodo elegidos.
import { useCallback, useEffect, useState } from 'react';
import type { ReturnSummary, ReturnTrip, TripFilter } from '../../../lib/devoluciones/types';
import { getSummary, listTrips } from '../api/devolucionesApi';

export interface UseReturnTrips {
  summary: ReturnSummary | null;
  trips: ReturnTrip[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useReturnTrips(state: TripFilter, from: string, to: string): UseReturnTrips {
  const [summary, setSummary] = useState<ReturnSummary | null>(null);
  const [trips, setTrips] = useState<ReturnTrip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([getSummary(), listTrips({ state, from, to })])
      .then(([nextSummary, nextTrips]) => {
        if (cancelled) return;
        setSummary(nextSummary);
        setTrips(nextTrips);
      })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : 'No se pudo cargar'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [state, from, to, version]);

  return { summary, trips, loading, error, reload };
}
