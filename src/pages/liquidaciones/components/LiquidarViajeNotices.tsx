// Avisos encima del cálculo: error, motivo por el que no se puede liquidar y viaje incompleto.

import { Link } from 'react-router-dom';
import { tripProgress } from '../../../lib/tarifas/tripOrders';
import { noLogicHref, type NoLogicInfo } from '../../../lib/tarifas/missingLogic';
import type { TripCalculation } from '../../../lib/tarifas/tripSettlement';

interface Props {
  calculation: TripCalculation | null;
  error: string;
  loadError: string;
  /** Falta la lógica de costos de la flota del viaje: se ofrece el enlace para cargarla. */
  noLogic?: NoLogicInfo | null;
}

export function LiquidarViajeNotices({ calculation, error, loadError, noLogic }: Props) {
  const progreso = calculation ? tripProgress(calculation.trip) : null;
  return (
    <>
      {(error || loadError) && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-4">
          {error || loadError}
          {noLogic && noLogicHref(noLogic) && (
            <div className="mt-2">
              <Link
                to={noLogicHref(noLogic) as string}
                className="inline-flex items-center gap-1 font-medium text-red-800 underline hover:text-red-900"
              >
                <i className="ri-settings-3-line" />
                {noLogic.fleet === 'OWN'
                  ? 'Cargar la estructura de costos de esta flota propia'
                  : 'Configurar tarifario y reglas de este transportista'}
              </Link>
            </div>
          )}
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
