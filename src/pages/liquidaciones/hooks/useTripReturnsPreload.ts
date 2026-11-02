// Precarga las devoluciones del viaje UNA vez por apertura (solo al liquidar, no al re-liquidar).
//
// Antes se repetía con cada cálculo nuevo y pisaba las devoluciones que la persona ya había cargado
// a mano; ahora que cambiar una variable recalcula, eso las borraría a cada tecla.

import { useEffect, useRef } from 'react';
import { listTripReturns } from '../../../lib/tarifas/tripsDataSource';
import type { SettlementRecord } from '../../../lib/tarifas/types';

type Returns = Awaited<ReturnType<typeof listTripReturns>>;

export function useTripReturnsPreload(
  calculation: unknown,
  tripId: string,
  settlement: SettlementRecord | null,
  isOpen: boolean,
  onLoaded: (returns: Returns) => void,
  onError: (message: string) => void,
) {
  // Viaje cuyas devoluciones ya se pidieron en esta apertura; al cerrar se olvida para la próxima.
  const loadedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      loadedFor.current = null;
      return;
    }
    if (!calculation || settlement || loadedFor.current === tripId) return;
    loadedFor.current = tripId;
    void (async () => {
      try {
        onLoaded(await listTripReturns(tripId));
      } catch (e) {
        console.error('No se pudieron leer las devoluciones del viaje:', e);
        loadedFor.current = null; // permite reintentar con el siguiente cálculo
        onError('No se pudieron precargar las devoluciones del viaje; podés cargarlas a mano.');
      }
    })();
    // `onLoaded`/`onError` son funciones del llamador: se precarga con el primer cálculo, no cuando ellas cambian.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calculation, tripId, settlement, isOpen]);
}
