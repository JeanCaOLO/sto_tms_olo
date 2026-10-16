import { useCallback } from 'react';
import { clockNow, getResumen, getViaje, IS_LOCAL, listViajes, type ListParams } from '../api';
import { usePolling } from './usePolling';

// Con datos locales la simulación va rápida: se consulta cada 2 s para ver el avance; con el backend, cada 10 s.
const POLL = IS_LOCAL ? { intervalMs: 2000, clock: clockNow } : { clock: clockNow };

/** Lista de viajes (recientes primero), refrescada sola. */
export function useViajesEnVivo(params: ListParams) {
  const fetcher = useCallback(() => listViajes(params), [params.mode, params.q, params.limit, params.country]); // eslint-disable-line react-hooks/exhaustive-deps
  return usePolling(fetcher, [params.mode, params.q, params.limit, params.country], POLL);
}

/** KPIs de la franja superior, refrescados solos. */
export function useResumen(country: string | null = null) {
  const fetcher = useCallback(() => getResumen(country), [country]);
  return usePolling(fetcher, [country], POLL);
}

/** Detalle del viaje abierto; sin id no consulta. */
export function useViajeDetalle(id: string | null) {
  const fetcher = useCallback(() => getViaje(id as string), [id]);
  return usePolling(fetcher, [id], { ...POLL, enabled: id !== null });
}
