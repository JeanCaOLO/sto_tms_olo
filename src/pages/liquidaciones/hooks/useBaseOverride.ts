// Tipo de cobro que reemplaza a la base por defecto del cálculo (Null = la base de siempre).

import { useRef, useState } from 'react';
import type { BaseMethodId, SettlementRecord, TripEdits } from '../../../lib/tarifas/types';

interface Recalculable {
  editsUsed: { current: TripEdits };
  setPending: (pending: boolean) => void;
  runCalc: (edits: TripEdits, extra?: { fresh?: boolean }) => Promise<unknown>;
}

export function useBaseOverride() {
  const [baseMethod, setBaseMethod] = useState<BaseMethodId | null>(null);
  // La base elegida en una ref: cada recálculo (variables, pedidos) tiene que respetarla.
  const baseUsed = useRef<BaseMethodId | null>(null);

  /** Al abrir: al re-liquidar se parte de la base con la que se emitió la anterior. */
  const reset = (settlement: SettlementRecord | null) => {
    const inicial = settlement?.baseChange?.method ?? null;
    baseUsed.current = inicial;
    setBaseMethod(inicial);
  };

  /** Cambiar el tipo de cobro recalcula con lo mismo que ya estaba cargado. */
  const change = (method: BaseMethodId | null, calc: Recalculable, extra: { fresh?: boolean } = {}) => {
    baseUsed.current = method;
    setBaseMethod(method);
    calc.setPending(true);
    void calc.runCalc(calc.editsUsed.current, extra);
  };

  return { baseMethod, baseUsed, reset, change };
}
