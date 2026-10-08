// Orchestration of all settlement emission states (calculation, custom vars, returns, emission).

import { useEffect } from 'react';
import { useCalculationState } from './useCalculationState';
import { useCustomVarsState } from './useCustomVarsState';
import { useCalculationTotals } from './useCalculationTotals';
import { useEmissionState } from './useEmissionState';
import { useExclusionsState } from './useExclusionsState';
import { useEditsUsed } from './useEditsUsed';
import { useTripReturnsPreload } from './useTripReturnsPreload';
import type { SettlementRecord, TripEdits, TripRecord } from '../../../lib/tarifas/types';

interface Props {
  trip: TripRecord | null;
  settlement: SettlementRecord | null;
  isOpen: boolean;
}

export function useLiquidarViajeController({ trip, settlement, isOpen }: Props) {
  const tripId = trip?.id ?? settlement?.tripId ?? '';
  const reliquidando = !!settlement;

  const calcState = useCalculationState({ tripId, isOpen, reliquidando, settlement });
  const { excludedSeqs, setExcludedSeqs, resetExcluded } = useExclusionsState();
  const emissionState = useEmissionState({ reliquidando, settlement });
  const customVarsState = useCustomVarsState({
    calculation: calcState.calculation,
    settlement,
    pending: calcState.pending,
    onPendingChange: calcState.setPending,
    onError: emissionState.setError,
    onCalcTriggered: (edits) => void calcState.runCalc(edits),
  });
  const { totals, effectiveResult } = useCalculationTotals(
    calcState.calculation,
    excludedSeqs,
  );

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

  return {
    calculation: calcState.calculation,
    loading: calcState.loading,
    pending: calcState.pending,
    loadError: calcState.loadError,
    error: emissionState.error,
    setError: emissionState.setError,
    saving: emissionState.saving,
    customRaw: customVarsState.customRaw,
    setCustomRaw: customVarsState.setCustomRaw,
    returns: emissionState.returns,
    setReturns: emissionState.setReturns,
    excludedSeqs,
    setExcludedSeqs,
    notes: emissionState.notes,
    setNotes: emissionState.setNotes,
    status: emissionState.status,
    setStatus: emissionState.setStatus,
    reason: emissionState.reason,
    setReason: emissionState.setReason,
    runCalc: calcState.runCalc,
    validateForm: (rets = emissionState.returns) => emissionState.validateForm(rets),
    emit: emissionState.emit,
    totals,
    effectiveResult,
    reliquidando,
    editsUsed,
  };
}

export type LiquidarViajeController = ReturnType<typeof useLiquidarViajeController>;
