// Emitir la liquidación de un viaje con lo que muestra el controlador. Lo usan el modal de un viaje
// y cada viaje del lote: así los dos validan, recalculan y guardan exactamente igual.

import { buildEmissionInput } from '../parts/emission';
import type { LiquidarViajeController } from './useLiquidarViajeController';
import type { SettlementRecord } from '../../../lib/tarifas/types';

export function useEmitTrip(ctrl: LiquidarViajeController, simple: boolean) {
  const { calculation, totals, effectiveResult, loading, pending, saving } = ctrl;

  const blocking = calculation?.blockingIssues ?? [];
  const puedeEmitir = !!calculation && !!totals && !calculation.notLiquidableReason
    && blocking.length === 0 && !loading && !pending && !saving;

  /** Valida, recalcula si cambió algo y guarda. null = no se emitió (el motivo queda en `ctrl.error`). */
  const emitir = async (): Promise<SettlementRecord | null> => {
    if (!calculation || !totals || !effectiveResult) return null;
    if (!ctrl.validateForm(ctrl.returns)) return null;
    if (!(await ctrl.recheck())) return null;

    const input = buildEmissionInput(
      calculation,
      ctrl.editsUsed,
      simple ? 'Borrador' : ctrl.status,
      ctrl.notes,
      ctrl.excludedSeqs,
      ctrl.returns,
      effectiveResult,
      totals,
    );
    return ctrl.emit(input);
  };

  return { emitir, puedeEmitir, blocking };
}
