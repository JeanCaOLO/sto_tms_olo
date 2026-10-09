// Acciones de las filas: abrir la liquidación entera y calentar el catálogo al pasar sobre "Liquidar".

import { useEffect, useRef } from 'react';
import { fetchSettlement } from '../api/liquidacionesApi';
import { prefetchTripCatalog } from '../../../lib/tarifas/tripSettlement';
import type { SettlementRecord, TripRecord } from '../../../lib/tarifas/types';

/** Tiempo que el cursor debe quedarse sobre "Liquidar" para calentar el catálogo. */
const PREFETCH_DELAY_MS = 300;

export function useTripRowActions(setError: (message: string) => void) {
  // La tabla trae las liquidaciones sin el cálculo (trace, reglas, avisos…); el desglose y re-liquidar
  // necesitan la liquidación entera, que se lee al abrir (y así siempre está al día).
  const openFull = async (s: SettlementRecord, open: (full: SettlementRecord) => void) => {
    try {
      open((await fetchSettlement(s.id)) ?? s);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo leer la liquidación.');
    }
  };

  // Calentar el catálogo solo si el cursor se queda sobre "Liquidar": recorrer la tabla con el mouse no
  // dispara una lectura por fila (cada una es una invocación del Lambda).
  const prefetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelPrefetch = () => {
    if (prefetchTimer.current) clearTimeout(prefetchTimer.current);
    prefetchTimer.current = null;
  };
  const schedulePrefetch = (t: TripRecord) => {
    cancelPrefetch();
    prefetchTimer.current = setTimeout(() => { void prefetchTripCatalog(t); }, PREFETCH_DELAY_MS);
  };
  useEffect(() => cancelPrefetch, []);

  /** Los manejadores del botón "Liquidar" de una fila. Con el botón deshabilitado no calientan nada. */
  const prefetchProps = (t: TripRecord, disabled: boolean) => {
    const start = () => { if (!disabled) schedulePrefetch(t); };
    return { onMouseEnter: start, onFocus: start, onMouseLeave: cancelPrefetch, onBlur: cancelPrefetch };
  };

  return { openFull, prefetchProps };
}
