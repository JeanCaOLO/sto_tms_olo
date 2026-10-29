import { useCallback } from 'react';
import { getViaje, listChoferes, listViajes, pollIntervalMs } from '../api';
import type { ListMode } from '../types';
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

/** Choferes con la app abierta (con o sin viaje), refrescados con el mismo ritmo que la lista. */
export function useChoferesEnLinea(country: string | null) {
  const fetcher = useCallback((signal: AbortSignal) => listChoferes(country, signal), [country]);
  return usePolling(fetcher, [country], { intervalMs: pollIntervalMs() });
}

/** Detalle del viaje abierto; sin id no consulta. */
export function useViajeDetalle(id: string | null) {
  const fetcher = useCallback((signal: AbortSignal) => getViaje(id as string, signal), [id]);
  return usePolling(fetcher, [id], { enabled: id !== null, intervalMs: pollIntervalMs() });
}
