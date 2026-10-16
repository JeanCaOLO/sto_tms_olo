import { useCallback, useEffect, useRef, useState } from 'react';

export const POLL_INTERVAL_MS = 10_000;

export interface PollingState<T> {
  data: T | null;
  error: Error | null;
  loading: boolean;
  updatedAt: number | null;
  refresh: () => Promise<void>;
}

/**
 * Consulta `fetcher` al montar, cada `intervalMs` y al volver a la pestaña. Se pausa con la pestaña
 * oculta. Descarta respuestas viejas (si cambian las deps mientras una consulta vuela). Con `enabled`
 * en false no consulta y limpia el dato.
 */
export function usePolling<T>(
  fetcher: () => Promise<T>,
  deps: readonly unknown[],
  { enabled = true, intervalMs = POLL_INTERVAL_MS, clock = Date.now }: { enabled?: boolean; intervalMs?: number; clock?: () => number } = {},
): PollingState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const ticket = useRef(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const clockRef = useRef(clock);
  clockRef.current = clock;

  const invalidate = useCallback(() => { ticket.current += 1; }, []);
  const run = useCallback(async () => {
    const mine = ++ticket.current;
    try {
      const result = await fetcherRef.current();
      if (mine !== ticket.current) return;
      setData(result);
      setError(null);
      setUpdatedAt(clockRef.current());
    } catch (err) {
      if (mine !== ticket.current) return;
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      if (mine === ticket.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      invalidate();
      setData(null);
      setError(null);
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    void run();
    const timer = setInterval(() => { if (!document.hidden) void run(); }, intervalMs);
    const onVisible = () => { if (!document.hidden) void run(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      invalidate();
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, intervalMs, run, invalidate, ...deps]);

  return { data, error, loading, updatedAt, refresh: run };
}
