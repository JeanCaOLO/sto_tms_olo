// Primer cálculo al abrir el modal (o al cambiar de viaje / liquidación) y su limpieza al cerrar.

import { useEffect, useState } from 'react';
import { emptyTripEdits } from '../../../lib/tarifas/tripContext';
import type { SettlementRecord } from '../../../lib/tarifas/types';
import type { useCalculationState } from './useCalculationState';

type CalcState = ReturnType<typeof useCalculationState>;

interface Props {
  tripId: string;
  isOpen: boolean;
  settlement: SettlementRecord | null;
  calc: CalcState;
  /** Se llama al abrir, antes de calcular (p. ej. para fijar la base con la que se emitió la anterior). */
  onOpen: () => void;
}

export function useCalculationLifecycle({ tripId, isOpen, settlement, calc, onOpen }: Props) {
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !tripId) return;
    let cancelled = false;
    calc.tripRead.current = null;
    calc.setCalculation(null);
    calc.setLoadError('');
    calc.setPending(false);
    setLoading(true);
    onOpen();

    void (async () => {
      await calc.runCalc(settlement?.tripEdits ?? emptyTripEdits());
      if (!cancelled) setLoading(false);
    })();

    return () => {
      cancelled = true;
      // Es un contador, no un nodo del DOM: se quiere su valor al cerrar.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      calc.calcSeq.current++;
    };
    // Se recalcula SOLO al abrir o cambiar de viaje/liquidación; `runCalc` cambia en cada render y haría un bucle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, tripId, settlement?.id]);

  return { loading };
}
