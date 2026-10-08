// State for trip calculation loading and errors.

import { useEffect, useRef, useState } from 'react';
import { calculateTrip, type TripCalculation } from '../../../lib/tarifas/tripSettlement';
import { emptyTripEdits } from '../../../lib/tarifas/tripContext';
import type { SettlementRecord, TripEdits } from '../../../lib/tarifas/types';

interface Props {
  tripId: string;
  isOpen: boolean;
  reliquidando: boolean;
  settlement: SettlementRecord | null;
}

export function useCalculationState({ tripId, isOpen, reliquidando, settlement }: Props) {
  const [calculation, setCalculation] = useState<TripCalculation | null>(null);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [loadError, setLoadError] = useState('');

  const calcSeq = useRef(0);

  const runCalc = async (edits: TripEdits) => {
    const seq = ++calcSeq.current;
    try {
      const res = await calculateTrip(tripId, edits, { allowSettled: reliquidando });
      if (seq !== calcSeq.current) return null;
      if (res.status !== 'ok') {
        setCalculation(null);
        setLoadError(res.message);
        return null;
      }
      setLoadError('');
      setCalculation(res.calculation);
      return res.calculation;
    } catch (e) {
      if (seq !== calcSeq.current) return null;
      console.error('Error calculando la liquidación:', e);
      setCalculation(null);
      setLoadError(e instanceof Error ? e.message : 'No se pudo calcular este viaje.');
      return null;
    } finally {
      if (seq === calcSeq.current) setPending(false);
    }
  };

  useEffect(() => {
    if (!isOpen || !tripId) return;
    let cancelled = false;
    setCalculation(null);
    setLoadError('');
    setPending(false);
    setLoading(true);

    void (async () => {
      const initial = settlement?.tripEdits ?? emptyTripEdits();
      const calc = await runCalc(initial);
      if (!cancelled) setLoading(false);
    })();

    return () => {
      cancelled = true;
      // Es un contador, no un nodo del DOM: se quiere su valor al cerrar.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      calcSeq.current++;
    };
    // Se recalcula SOLO al abrir o cambiar de viaje/liquidación; `runCalc` cambia en cada render y haría un bucle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, tripId, settlement?.id]);

  return {
    calculation,
    setCalculation,
    loading,
    pending,
    setPending,
    loadError,
    setLoadError,
    runCalc,
  };
}
