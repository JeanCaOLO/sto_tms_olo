// Viajes pendientes de liquidar: carga, estado y aviso de lista recortada.

import { useCallback, useRef, useState } from 'react';
import { fetchPendingTrips } from '../api/liquidacionesApi';
import type { TripRecord } from '../../../lib/tarifas/types';

export function useTripsLoader(
  countryId: string | null,
  from: string,
  to: string,
  setError: (message: string) => void,
) {
  const [trips, setTrips] = useState<TripRecord[]>([]);
  const [loadingTrips, setLoadingTrips] = useState(true);
  const [tripsRecortados, setTripsRecortados] = useState(false);
  const requestSeq = useRef(0);

  const loadTrips = useCallback(async () => {
    if (!countryId) { setTrips([]); setLoadingTrips(false); return; }
    setLoadingTrips(true);
    const seq = ++requestSeq.current;
    try {
      let recortada = false;
      const data = await fetchPendingTrips({ countryId, from, to }, { onTruncated: () => { recortada = true; } });
      if (seq === requestSeq.current) { setTrips(data); setTripsRecortados(recortada); }
    } catch (e) {
      if (seq === requestSeq.current) {
        setTrips([]);
        setError(e instanceof Error ? e.message : 'No se pudieron leer los viajes por liquidar.');
      }
    } finally {
      if (seq === requestSeq.current) setLoadingTrips(false);
    }
  }, [countryId, from, to, setError]);

  return { trips, loadingTrips, tripsRecortados, loadTrips };
}
