import { useCallback } from 'react';
import { getViaje, listViajes, type ListParams } from '../api';
import { usePolling } from './usePolling';

/** Lista de viajes (recientes primero) refrescada cada 10 s. */
export function useViajesEnVivo(params: ListParams) {
  const fetcher = useCallback(() => listViajes(params), [params.activos, params.q, params.limit]); // eslint-disable-line react-hooks/exhaustive-deps
  return usePolling(fetcher, [params.activos, params.q, params.limit]);
}

/** Detalle del viaje abierto; sin id no consulta. */
export function useViajeDetalle(id: string | null) {
  const fetcher = useCallback(() => getViaje(id as string), [id]);
  return usePolling(fetcher, [id], { enabled: id !== null });
}
