// Orchestration of all settlement emission states (calculation, custom vars, returns, emission).

import { useEffect } from 'react';
import { useCalculationLifecycle } from './useCalculationLifecycle';
import { useCalculationState } from './useCalculationState';
import { useCustomVarsState } from './useCustomVarsState';
import { useCalculationTotals } from './useCalculationTotals';
import { useEmissionState } from './useEmissionState';
import { useExclusionsState } from './useExclusionsState';
import { useEditsUsed } from './useEditsUsed';
import { useRecheckBeforeEmit } from './useRecheckBeforeEmit';
import { useTripReturnsPreload } from './useTripReturnsPreload';
import type { SettlementRecord, TripRecord } from '../../../lib/tarifas/types';

interface Props {
  trip: TripRecord | null;
  settlement: SettlementRecord | null;
  isOpen: boolean;
}

export function useLiquidarViajeController({ trip, settlement, isOpen }: Props) {
  const tripId = trip?.id ?? settlement?.tripId ?? '';
  const reliquidando = !!settlement;

  const emissionState = useEmissionState({ reliquidando, settlement });
  // Un error anterior (p. ej. una emisión fallida) no se queda pegado si lo siguiente funcionó.
  const calcState = useCalculationState({
    tripId, trip, reliquidando, onCalculated: () => emissionState.setError(''),
  });
  const { loading } = useCalculationLifecycle({ tripId, isOpen, settlement, calc: calcState });
  const { excludedSeqs, setExcludedSeqs, resetExcluded } = useExclusionsState();
  const customVarsState = useCustomVarsState({
    calculation: calcState.calculation,
    settlement,
    pending: calcState.pending,
    onPendingChange: calcState.setPending,
    onError: emissionState.setError,
    onCalcTriggered: (edits) => void calcState.runCalc(edits),
  });
  const { totals, effectiveResult } = useCalculationTotals(calcState.calculation, excludedSeqs);

  useEffect(() => {
    if (!isOpen) return;
    emissionState.initFromSettlement(settlement);
    resetExcluded();
    customVarsState.setCustomRaw({});
    // Se reinicia SOLO al abrir o cambiar de liquidación; los estados de los otros hooks cambian en cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, settlement?.id]);

  const editsUsed = useEditsUsed(calcState.calculation, customVarsState.customRaw);
  useTripReturnsPreload(
    calcState.calculation, tripId, settlement, emissionState.setReturns, emissionState.setError,
  );
  const recheck = useRecheckBeforeEmit({
    calc: calcState, reliquidando, setError: emissionState.setError, resetExcluded,
  });

  return {
    ...calcState,
    ...emissionState,
    loading,
    customRaw: customVarsState.customRaw,
    setCustomRaw: customVarsState.setCustomRaw,
    excludedSeqs,
    setExcludedSeqs,
    /** Lo calculado más reciente: lo que se guarda, aunque después se siga tecleando. */
    lastEdits: calcState.editsUsed,
    recheck,
    validateForm: (rets = emissionState.returns) => emissionState.validateForm(rets),
    totals,
    effectiveResult,
    reliquidando,
    editsUsed,
  };
}

export type LiquidarViajeController = ReturnType<typeof useLiquidarViajeController>;
