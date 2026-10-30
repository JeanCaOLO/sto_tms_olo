// Motor del refresco periódico (sin React): una sola consulta en vuelo, timeout con abort, espera creciente ante
// errores y pausa con la pestaña oculta. `usePolling` solo lo conecta al ciclo de vida del componente.
import type { MutableRefObject } from 'react';

export const POLL_INTERVAL_MS = 5_000;
export const REQUEST_TIMEOUT_MS = 15_000;
export const MAX_BACKOFF_MS = 60_000;

export interface Snapshot<T> {
  data: T | null;
  error: Error | null;
  loading: boolean;
  /** Hora (reloj real) de la última respuesta buena. */
  updatedAt: number | null;
}

export interface Poller {
  refresh: () => void;
  stop: () => void;
}

export interface PollerConfig<T> {
  fetcher: MutableRefObject<(signal: AbortSignal) => Promise<T>>;
  enabled: boolean;
  intervalMs: number;
  timeoutMs: number;
  setState: (update: (prev: Snapshot<T>) => Snapshot<T>) => void;
}

/** Espera hasta la próxima consulta: el intervalo, o el doble por cada error seguido (tope 60 s). */
export function backoffDelay(intervalMs: number, failures: number): number {
  return failures ? Math.min(intervalMs * 2 ** failures, MAX_BACKOFF_MS) : intervalMs;
}

export const emptySnapshot = <T>(loading: boolean): Snapshot<T> => ({ data: null, error: null, loading, updatedAt: null });

const isHidden = () => typeof document !== 'undefined' && document.hidden;

/** Arranca el refresco y devuelve cómo forzarlo o detenerlo. Cada parada descarta lo que siga en vuelo. */
export function startPoller<T>({ fetcher, intervalMs, timeoutMs, setState }: PollerConfig<T>): Poller {
  let stopped = false;
  let inFlight: AbortController | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let failures = 0;

  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(run, backoffDelay(intervalMs, failures));
  };

  async function run() {
    if (stopped || inFlight) return;
    if (isHidden()) { schedule(); return; }
    const controller = new AbortController();
    inFlight = controller;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const data = await fetcher.current(controller.signal);
      if (stopped) return;
      failures = 0;
      setState(() => ({ data, error: null, loading: false, updatedAt: Date.now() }));
    } catch (err) {
      if (stopped) return;
      failures += 1;
      setState((prev) => ({ ...prev, error: err instanceof Error ? err : new Error(String(err)), loading: false }));
    } finally {
      clearTimeout(timeout);
      if (inFlight === controller) inFlight = null;
      if (!stopped) schedule();
    }
  }

  const onVisible = () => { if (!isHidden()) void run(); };
  document.addEventListener('visibilitychange', onVisible);
  void run();

  return {
    refresh: () => { void run(); },
    stop: () => {
      stopped = true;
      inFlight?.abort();
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    },
  };
}

/** Efecto de `usePolling`: limpia el dato anterior y, si está habilitado, arranca un poller nuevo. */
export function bindPoller<T>(ref: MutableRefObject<Poller | null>, config: PollerConfig<T>): () => void {
  config.setState(() => emptySnapshot<T>(config.enabled));
  if (!config.enabled) return () => undefined;
  const poller = startPoller(config);
  ref.current = poller;
  return () => {
    poller.stop();
    if (ref.current === poller) ref.current = null;
  };
}
