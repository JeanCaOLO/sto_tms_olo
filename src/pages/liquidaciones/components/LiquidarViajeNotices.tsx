// Avisos encima del cálculo: error, motivo por el que no se puede liquidar y viaje incompleto.

import { tripProgress } from '../../../lib/tarifas/tripOrders';
import type { TripCalculation } from '../../../lib/tarifas/tripSettlement';

interface Props {
  calculation: TripCalculation | null;
  error: string;
  loadError: string;
}

export function LiquidarViajeNotices({ calculation, error, loadError }: Props) {
  const progreso = calculation ? tripProgress(calculation.trip) : null;
  return (
    <>
      {(error || loadError) && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-4">
          {error || loadError}
        </div>
      )}
      {calculation?.notLiquidableReason && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-lg px-4 py-2.5 mb-4">
          <i className="ri-information-line mr-1" />{calculation.notLiquidableReason}
        </div>
      )}
      {calculation && progreso && !progreso.complete && !calculation.notLiquidableReason && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-lg px-4 py-2.5 mb-4">
          <i className="ri-error-warning-line mr-1" />
          Este viaje no está 100 % entregado ({progreso.label.toLowerCase()}). Podés liquidarlo completo, o
          anular los pedidos que no corresponden / dejarlos para liquidar después.
        </div>
      )}
    </>
  );
}
