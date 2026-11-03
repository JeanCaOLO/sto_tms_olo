// State for custom variables with validation and debouncing.

import { useEffect, useRef, useState } from 'react';
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

  // Los callbacks del controlador cambian en cada render: se leen por ref para que el efecto del
  // debounce dependa solo de lo tecleado y un render ajeno no reinicie los 400 ms.
  const callbacks = useRef({ onPendingChange, onError, onCalcTriggered });
  useEffect(() => {
    callbacks.current = { onPendingChange, onError, onCalcTriggered };
  });

  const handleSetRaw = (key: string, value: string) => {
    setCustomRaw((prev) => ({ ...prev, [key]: value }));
    onPendingChange(true);
  };

  // Se siembra UNA vez por apertura (customRaw vacío + hay cálculo): sembrar con cada cálculo nuevo
  // borraría lo que la persona acaba de teclear. Al re-liquidar parte de lo guardado en esa liquidación.
  useEffect(() => {
    if (!calculation) return;
    if (Object.keys(customRaw).length > 0) return;
    const guardado = Object.fromEntries(
      Object.entries(settlement?.tripEdits?.customVars ?? {}).map(([k, v]) => [k, String(v)]),
    );
    const seed = { ...initialCustomVarValues(calculation.customVarFields), ...guardado };
    if (Object.keys(seed).length > 0) setCustomRaw(seed);
  }, [calculation, settlement, customRaw]);

  useEffect(() => {
    if (!pending || !calculation) return;
    const { values, errors } = parseCustomVarValues(calculation.customVarFields, customRaw);
    if (Object.keys(errors).length > 0) {
      callbacks.current.onError(Object.values(errors).join(' '));
      callbacks.current.onPendingChange(false);
      return;
    }
    callbacks.current.onError('');
    const timer = setTimeout(() => {
      callbacks.current.onCalcTriggered({ customVars: values as TripEdits['customVars'] });
    }, 400);
    return () => clearTimeout(timer);
  }, [customRaw, calculation, pending]);

  return { customRaw, setCustomRaw, handleSetRaw };
}
