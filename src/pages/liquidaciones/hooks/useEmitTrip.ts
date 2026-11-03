// Emitir la liquidación de un viaje con lo que muestra el controlador. Lo usan el modal de un viaje
// y cada viaje del lote: así los dos validan, recalculan y guardan exactamente igual.

import { useRef, useState } from 'react';
import { parseCustomVarValues } from '../../../lib/tarifas/customVarFields';
import { buildEmissionInput } from '../parts/emission';
import type { LiquidarViajeController } from './useLiquidarViajeController';
import type { SettlementRecord, TripEdits } from '../../../lib/tarifas/types';

export function useEmitTrip(ctrl: LiquidarViajeController, simple: boolean) {
  const { calculation, totals, effectiveResult, loading, pending, saving } = ctrl;
  // `saving` solo se activa al guardar, DESPUÉS de revalidar contra la red: sin esto un segundo clic
  // durante esa espera emitía dos veces la misma liquidación.
  const inFlight = useRef(false);
  const [emitiendo, setEmitiendo] = useState(false);

  const blocking = calculation?.blockingIssues ?? [];
  const puedeEmitir = !!calculation && !!totals && !calculation.notLiquidableReason
    && blocking.length === 0 && !loading && !pending && !saving && !emitiendo;

  /** Valida, recalcula si cambió algo y guarda. null = no se emitió (el motivo queda en `ctrl.error`). */
  const emitir = async (): Promise<SettlementRecord | null> => {
    if (inFlight.current) return null;
    if (!calculation || !totals || !effectiveResult) return null;
    inFlight.current = true;
    setEmitiendo(true);
    try {
      if (!ctrl.validateForm(ctrl.returns)) return null;

      // Lo que se guarda como "variables cargadas" es lo que el cálculo usó: se parsean los campos y,
      // si alguno no es un número, no se emite con un total que no lo refleja.
      const parsed = parseCustomVarValues(calculation.customVarFields, ctrl.customRaw);
      if (Object.keys(parsed.errors).length > 0) {
        ctrl.setError(Object.values(parsed.errors).join(' '));
        return null;
      }
      const edits: TripEdits = { customVars: parsed.values as TripEdits['customVars'] };

      if (!(await ctrl.recheck())) return null;

      const input = buildEmissionInput(
        calculation,
        edits,
        simple ? 'Borrador' : ctrl.status,
        ctrl.notes,
        ctrl.excludedSeqs,
        ctrl.returns,
        effectiveResult,
        totals,
      );
      return await ctrl.emit(input);
    } finally {
      inFlight.current = false;
      setEmitiendo(false);
    }
  };

  return { emitir, puedeEmitir, blocking };
}
