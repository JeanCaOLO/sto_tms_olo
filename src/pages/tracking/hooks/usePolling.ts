import { useCallback, useEffect, useRef, useState } from 'react';
import { bindPoller, emptySnapshot, POLL_INTERVAL_MS, REQUEST_TIMEOUT_MS, type Poller, type Snapshot } from './polling-runner';

export { MAX_BACKOFF_MS, POLL_INTERVAL_MS, REQUEST_TIMEOUT_MS } from './polling-runner';

export interface PollingState<T> extends Snapshot<T> {
  refresh: () => void;
}

interface Options {
  enabled?: boolean;
  intervalMs?: number;
  timeoutMs?: number;
}

/**
 * Consulta `fetcher` al montar, cada `intervalMs` y al volver a la pestaña; se pausa con la pestaña oculta.
 * Una sola consulta en vuelo, timeout con abort, espera creciente ante errores y, al cambiar las deps, limpia
 * el dato anterior (no se muestra el de otra consulta). La lógica vive en `polling-runner.ts`.
 */
export function usePolling<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  deps: readonly unknown[],
  { enabled = true, intervalMs = POLL_INTERVAL_MS, timeoutMs = REQUEST_TIMEOUT_MS }: Options = {},
): PollingState<T> {
  const [state, setState] = useState<Snapshot<T>>(() => emptySnapshot<T>(enabled));
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const poller = useRef<Poller | null>(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => bindPoller(poller, { fetcher: fetcherRef, enabled, intervalMs, timeoutMs, setState }), [enabled, intervalMs, timeoutMs, ...deps]);
  const refresh = useCallback(() => poller.current?.refresh(), []);

  return { ...state, refresh };
}
