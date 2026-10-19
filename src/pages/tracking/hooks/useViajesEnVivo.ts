import { useCallback, useEffect, useState } from 'react';
import { getRecorrido, getViaje, listViajes, pollIntervalMs } from '../api';
import type { ListMode, Recorrido } from '../types';
import { usePolling } from './usePolling';

export interface ListFilters {
  mode: ListMode;
  q: string;
  limit: number;
  country: string | null;
}

/** Lista de viajes (recientes primero) + KPIs en UNA sola llamada, refrescada sola. */
export function useViajesEnVivo({ mode, q, limit, country }: ListFilters) {
  const fetcher = useCallback(
    (signal: AbortSignal) => listViajes({ mode, q, limit, country, summary: true }, signal),
    [mode, q, limit, country],
  );
  return usePolling(fetcher, [mode, q, limit, country], { intervalMs: pollIntervalMs() });
}

/** Detalle del viaje abierto; sin id no consulta. */
export function useViajeDetalle(id: string | null) {
  const fetcher = useCallback((signal: AbortSignal) => getViaje(id as string, signal), [id]);
  return usePolling(fetcher, [id], { enabled: id !== null, intervalMs: pollIntervalMs() });
}

/** Recorrido completo del viaje, una sola vez (para el replay); null = sin pedir. */
export function useRecorrido(id: string | null) {
  const [state, setState] = useState<{ id: string; data: Recorrido | null; error: boolean } | null>(null);
  useEffect(() => {
    if (!id) { setState(null); return undefined; }
    const controller = new AbortController();
    setState({ id, data: null, error: false });
    getRecorrido(id, controller.signal)
      .then((data) => setState({ id, data, error: false }))
      .catch(() => { if (!controller.signal.aborted) setState({ id, data: null, error: true }); });
    return () => controller.abort();
  }, [id]);
  return state && state.id === id ? state : null;
}
