import { useCallback } from 'react';
import { getViaje, listChoferes, listMisEntregas, listViajes, pollIntervalMs, TrackingApiError } from '../api';
import type { ListMode, ViajesPage } from '../types';
import { usePolling } from './usePolling';

export interface ListFilters {
  mode: ListMode;
  q: string;
  limit: number;
  country: string | null;
}

/** Página de viajes + el `limit` con el que se pidió: al conservar datos entre consultas hay que saber de cuál son. */
export type ViajesVivo = ViajesPage & { requestedLimit: number };

/** Lista de viajes (recientes primero) + KPIs en UNA sola llamada, refrescada sola. */
export function useViajesEnVivo({ mode, q, limit, country }: ListFilters) {
  const fetcher = useCallback(
    async (signal: AbortSignal): Promise<ViajesVivo> => ({
      ...(await listViajes({ mode, q, limit, country, summary: true }, signal)),
      requestedLimit: limit,
    }),
    [mode, q, limit, country],
  );
  // Buscar, cambiar de modo o pedir más NO vacía la lista (ni quita los camiones del mapa): solo otro país la limpia.
  return usePolling(fetcher, [mode, q, limit, country], { intervalMs: pollIntervalMs(), resetKey: country });
}

const isForbidden = (error: Error) => error instanceof TrackingApiError && (error.status === 401 || error.status === 403);

/** Choferes con la app abierta (con o sin viaje), refrescados con el mismo ritmo que la lista. */
export function useChoferesEnLinea(country: string | null) {
  const fetcher = useCallback((signal: AbortSignal) => listChoferes(country, signal), [country]);
  // Solo el administrador ve a los choferes: ante un 401/403 no se vuelve a preguntar cada ciclo.
  return usePolling(fetcher, [country], { intervalMs: pollIntervalMs(), shouldRetry: (error) => !isForbidden(error) });
}

/** Detalle del viaje abierto; sin id no consulta. */
export function useViajeDetalle(id: string | null) {
  const fetcher = useCallback((signal: AbortSignal) => getViaje(id as string, signal), [id]);
  return usePolling(fetcher, [id], { enabled: id !== null, intervalMs: pollIntervalMs() });
}

/** Entregas del cliente (rol Cliente), refrescadas con el mismo ritmo que la lista del monitor. */
export function useMisEntregas() {
  const fetcher = useCallback((signal: AbortSignal) => listMisEntregas(signal), []);
  return usePolling(fetcher, [], { intervalMs: pollIntervalMs() });
}
