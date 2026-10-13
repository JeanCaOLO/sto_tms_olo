// State for trip calculation loading and errors.

import { useRef, useState, type MutableRefObject } from 'react';
import { calculateTrip, type TripCalculation } from '../../../lib/tarifas/tripSettlement';
import { emptyTripEdits } from '../../../lib/tarifas/tripContext';
import type { NoLogicInfo } from '../../../lib/tarifas/missingLogic';
import type { BaseMethodId, TripEdits, TripRecord } from '../../../lib/tarifas/types';

interface Props {
  tripId: string;
  /** El viaje que ya trae la bandeja: evita pedirlo de nuevo (la emisión lo valida otra vez). */
  trip?: TripRecord | null;
  reliquidando: boolean;
  baseUsed: MutableRefObject<BaseMethodId | null>;
  /** Se llama cuando un cálculo salió bien (p. ej. para limpiar un error anterior). */
  onCalculated?: () => void;
}

export function useCalculationState({ tripId, trip, reliquidando, baseUsed, onCalculated }: Props) {
  const [calculation, setCalculation] = useState<TripCalculation | null>(null);
  const [pending, setPending] = useState(false);
  const [loadError, setLoadError] = useState('');
  // Falta la lógica de costos de la flota del viaje: se ofrece el enlace para cargarla.
  const [noLogic, setNoLogic] = useState<NoLogicInfo | null>(null);

  const calcSeq = useRef(0);
  // Lo que se calculó: es lo que se guarda, aunque después se siga tecleando.
  const editsUsed = useRef<TripEdits>(emptyTripEdits());
  // El viaje ya leído: los recálculos lo reusan. Lo que cambia entre cálculos —pedidos y marcas— se lee fresco.
  const tripRead = useRef<TripRecord | null>(null);

  const runCalc = async (edits: TripEdits, extra: { fresh?: boolean } = {}) => {
    const seq = ++calcSeq.current;
    const fail = (message: string, info: NoLogicInfo | null = null) => {
      setCalculation(null);
      setLoadError(message);
      setNoLogic(info);
      return null;
    };
    try {
      const res = await calculateTrip(tripRead.current ?? trip ?? tripId, edits, {
        allowSettled: reliquidando,
        baseOverride: baseUsed.current ? { method: baseUsed.current } : null,
        ...extra,
      });
      if (seq !== calcSeq.current) return null;
      if (res.status !== 'ok') {
        return fail(res.message, res.status === 'catalog-error' ? res.noLogic ?? null : null);
      }
      editsUsed.current = edits;
      tripRead.current = res.calculation.trip;
      setLoadError('');
      setNoLogic(null);
      setCalculation(res.calculation);
      onCalculated?.();
      return res.calculation;
    } catch (e) {
      if (seq !== calcSeq.current) return null;
      console.error('Error calculando la liquidación:', e);
      return fail(e instanceof Error ? e.message : 'No se pudo calcular este viaje.');
    } finally {
      if (seq === calcSeq.current) setPending(false);
    }
  };

  return {
    calculation, setCalculation, pending, setPending, loadError, setLoadError, noLogic,
    tripRead, editsUsed, calcSeq, runCalc,
  };
}
