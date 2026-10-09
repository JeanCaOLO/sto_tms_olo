// State for custom variables with validation and debouncing.

import { useEffect, useState } from 'react';
import {
  parseCustomVarValues,
  initialCustomVarValues,
} from '../../../lib/tarifas/customVarFields';
import type { TripCalculation } from '../../../lib/tarifas/tripSettlement';
import type { SettlementRecord, TripEdits } from '../../../lib/tarifas/types';

interface Props {
  calculation: TripCalculation | null;
  settlement: SettlementRecord | null;
  pending: boolean;
  onPendingChange: (pending: boolean) => void;
  onError: (error: string) => void;
  onCalcTriggered: (edits: TripEdits) => void;
}

export function useCustomVarsState({
  calculation,
  settlement,
  pending,
  onPendingChange,
  onError,
  onCalcTriggered,
}: Props) {
  const [customRaw, setCustomRaw] = useState<Record<string, string>>({});

  const handleSetRaw = (key: string, value: string) => {
    setCustomRaw((prev) => ({ ...prev, [key]: value }));
    onPendingChange(true);
  };

  useEffect(() => {
    if (!calculation) {
      setCustomRaw({});
      return;
    }
    if (!settlement) {
      setCustomRaw({ ...initialCustomVarValues(calculation.customVarFields) });
    }
  }, [calculation, settlement]);

  useEffect(() => {
    if (!pending || !calculation) return;
    const { values, errors } = parseCustomVarValues(calculation.customVarFields, customRaw);
    if (Object.keys(errors).length > 0) {
      onError(Object.values(errors).join(' '));
      onPendingChange(false);
      return;
    }
    onError('');
    const timer = setTimeout(() => {
      onCalcTriggered({ customVars: values as TripEdits['customVars'] });
    }, 400);
    return () => clearTimeout(timer);
  }, [customRaw, calculation, pending, onCalcTriggered, onError, onPendingChange]);

  return { customRaw, setCustomRaw, handleSetRaw };
}
