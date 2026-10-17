import { useCallback, useEffect, useRef, useState } from 'react';

export const POLL_INTERVAL_MS = 15_000;
export const REQUEST_TIMEOUT_MS = 15_000;
export const MAX_BACKOFF_MS = 60_000;

export interface PollingState<T> {
  data: T | null;
  error: Error | null;
  loading: boolean;
  /** Hora (reloj real) de la última respuesta buena. */
  updatedAt: number | null;
  refresh: () => void;
}

interface Options {
  enabled?: boolean;
  intervalMs?: number;
  timeoutMs?: number;
}

/**
 * Consulta `fetcher` al montar, cada `intervalMs` y al volver a la pestaña; se pausa con la pestaña oculta.
 * - Una sola consulta en vuelo: si la anterior no terminó, el tick se salta (no se acumulan ni se descartan todas).
 * - Cada consulta se aborta a los `timeoutMs`; al cambiar las deps o desmontar se aborta la que vuela.
 * - Ante error espera el doble (hasta 60 s) antes de reintentar; vuelve al intervalo normal al primer acierto.
 * - Al cambiar las deps limpia el dato anterior (no se muestra el de otra consulta).
 */
export function usePolling<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  deps: readonly unknown[],
  { enabled = true, intervalMs = POLL_INTERVAL_MS, timeoutMs = REQUEST_TIMEOUT_MS }: Options = {},
): PollingState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const inFlight = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const failures = useRef(0);
  const generation = useRef(0);

  const schedule = useCallback((run: () => void) => {
    if (timer.current) clearTimeout(timer.current);
    const wait = failures.current ? Math.min(intervalMs * 2 ** failures.current, MAX_BACKOFF_MS) : intervalMs;
    timer.current = setTimeout(run, wait);
  }, [intervalMs]);

  const run = useCallback(async () => {
    if (inFlight.current) return;
    if (typeof document !== 'undefined' && document.hidden) { schedule(() => void run()); return; }
    const mine = generation.current;
    const controller = new AbortController();
    inFlight.current = controller;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const result = await fetcherRef.current(controller.signal);
      if (mine !== generation.current) return;
      failures.current = 0;
      setData(result);
      setError(null);
      setUpdatedAt(Date.now());
    } catch (err) {
      if (mine !== generation.current) return;
      failures.current += 1;
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      clearTimeout(timeout);
      if (inFlight.current === controller) inFlight.current = null;
      if (mine === generation.current) {
        setLoading(false);
        schedule(() => void run());
      }
    }
  }, [schedule, timeoutMs]);

  useEffect(() => {
    generation.current += 1;
    inFlight.current?.abort();
    inFlight.current = null;
    failures.current = 0;
    setData(null);
    setError(null);
    setUpdatedAt(null);
    if (!enabled) {
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    void run();
    const onVisible = () => { if (!document.hidden) void run(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      generation.current += 1;
      inFlight.current?.abort();
      inFlight.current = null;
      if (timer.current) clearTimeout(timer.current);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, run, ...deps]);

  const refresh = useCallback(() => { if (enabled) void run(); }, [enabled, run]);

  return { data, error, loading, updatedAt, refresh };
}
