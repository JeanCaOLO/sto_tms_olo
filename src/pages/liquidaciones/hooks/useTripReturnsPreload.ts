// Precarga las devoluciones del viaje cada vez que hay un cálculo nuevo (solo al liquidar, no al re-liquidar).

import { useEffect } from 'react';
import { listTripReturns } from '../../../lib/tarifas/tripsDataSource';
import type { SettlementRecord } from '../../../lib/tarifas/types';

type Returns = Awaited<ReturnType<typeof listTripReturns>>;

export function useTripReturnsPreload(
  calculation: unknown,
  tripId: string,
  settlement: SettlementRecord | null,
  onLoaded: (returns: Returns) => void,
  onError: (message: string) => void,
) {
  useEffect(() => {
    if (!calculation || settlement) return;
    void (async () => {
      try {
        onLoaded(await listTripReturns(tripId));
      } catch (e) {
        console.error('No se pudieron leer las devoluciones del viaje:', e);
        onError('No se pudieron precargar las devoluciones del viaje; podés cargarlas a mano.');
      }
    })();
    // `onLoaded`/`onError` son funciones del llamador: se precarga con un cálculo nuevo, no cuando ellas cambian.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calculation, tripId, settlement]);
}
