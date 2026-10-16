// Lo cargado a mano en el modal (variables del viaje + forma de liquidar), tal como se va a guardar.

import { useEffect, useRef } from 'react';
import { emptyTripEdits } from '../../../lib/tarifas/tripContext';
import type { TripCalculation } from '../../../lib/tarifas/tripSettlement';
import type { TripEdits } from '../../../lib/tarifas/types';

export function useEditsUsed(
  calculation: TripCalculation | null,
  customRaw: Record<string, string>,
): TripEdits {
  const editsUsed = useRef<TripEdits>(emptyTripEdits());

  useEffect(() => {
    if (!calculation || !customRaw) return;
    editsUsed.current = {
      customVars: { ...customRaw },
    };
  }, [calculation, customRaw]);

  return editsUsed.current;
}
